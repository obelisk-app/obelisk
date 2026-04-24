import { parseJsonBody } from '@/lib/api-json';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { withClient, classifyNwcError } from '@/lib/nwc';
import { parseBolt11 } from '@/lib/bolt11';
import { ServerToClient } from '@/lib/socket-events';

/**
 * POST /api/invoices/pay  { invoice, messageId?, channelId? }
 *
 * Pays a public BOLT11 invoice posted in chat. The first caller to submit
 * wins — concurrent payers race on the unique `paymentHash` constraint,
 * and losers are told `already_paid` without triggering a second NWC pay.
 */
export async function POST(req: NextRequest) {
  const payer = await getAuthPubkey(req);
  if (!payer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await parseJsonBody(req);
  const { invoice, messageId, channelId } = body as {
    invoice?: string;
    messageId?: string;
    channelId?: string;
  };
  if (!invoice || !/^ln(bc|tb|bcrt)/i.test(invoice)) {
    return NextResponse.json({ error: 'invalid_invoice' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseBolt11(invoice);
  } catch {
    return NextResponse.json({ error: 'invalid_invoice' }, { status: 400 });
  }

  const now = Math.floor(Date.now() / 1000);
  if (parsed.expiresAt && parsed.expiresAt < now) {
    return NextResponse.json({ error: 'expired' }, { status: 400 });
  }

  const existing = await prisma.invoicePayment.findUnique({
    where: { paymentHash: parsed.paymentHash },
  });
  if (existing) {
    return NextResponse.json({ error: 'already_paid' }, { status: 409 });
  }

  try {
    const result = await withClient(payer, async (c) => c.payInvoice({ invoice }));
    if (!result) return NextResponse.json({ error: 'no_wallet' }, { status: 404 });
  } catch (err) {
    const code = classifyNwcError(err);
    const status = code === 'insufficient_funds' ? 402 : 502;
    return NextResponse.json({ error: code }, { status });
  }

  let row;
  try {
    row = await prisma.invoicePayment.create({
      data: {
        paymentHash: parsed.paymentHash,
        messageId: messageId || null,
        channelId: channelId || null,
        payerPubkey: payer,
        amountSats: parsed.amountSats,
      },
    });
  } catch {
    // Race: another payer inserted between our findUnique and create.
    // The pay succeeded on their wallet, so return already_paid.
    return NextResponse.json({ error: 'already_paid' }, { status: 409 });
  }

  const io = (globalThis as any).__io;
  if (io && channelId) {
    io.to(`channel:${channelId}`).emit(ServerToClient.InvoicePaid, {
      paymentHash: parsed.paymentHash,
      payerPubkey: payer,
      paidAt: row.paidAt,
      messageId: messageId || null,
      channelId,
      amountSats: parsed.amountSats,
    });
  }

  return NextResponse.json({ ok: true, paidAt: row.paidAt });
}
