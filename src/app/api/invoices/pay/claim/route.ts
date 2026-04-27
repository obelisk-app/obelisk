// src/app/api/invoices/pay/claim/route.ts
// Server-side race protection for client-driven invoice payment. Atomically
// inserts a 'pending' InvoicePayment row keyed on paymentHash. First caller
// wins; concurrent callers get 409. Stale 'pending' rows older than 30s
// are swept on every claim attempt so a crashed payer doesn't block forever.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { parseBolt11 } from '@/lib/bolt11';

const PENDING_SWEEP_MS = 30_000;

export async function POST(req: NextRequest) {
  const payer = await getAuthPubkey(req);
  if (!payer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const invoice = (body as { invoice?: string }).invoice;
  const channelId = (body as { channelId?: string }).channelId;
  const messageId = (body as { messageId?: string }).messageId;
  if (!invoice || typeof invoice !== 'string' || !/^ln(bc|tb|bcrt)/i.test(invoice)) {
    return NextResponse.json({ error: 'invalid_invoice' }, { status: 400 });
  }

  let parsed: { paymentHash: string; expiresAt?: number; amountMsat?: number };
  try {
    parsed = parseBolt11(invoice);
  } catch {
    return NextResponse.json({ error: 'invalid_invoice' }, { status: 400 });
  }
  const now = Math.floor(Date.now() / 1000);
  if (parsed.expiresAt && parsed.expiresAt < now) {
    return NextResponse.json({ error: 'expired' }, { status: 400 });
  }

  // Sweep stale pending rows so a crashed payer doesn't permanently block.
  await prisma.invoicePayment.deleteMany({
    where: { status: 'pending', createdAt: { lt: new Date(Date.now() - PENDING_SWEEP_MS) } },
  });

  try {
    const amountSats = Math.floor((parsed.amountMsat ?? 0) / 1000);
    await prisma.invoicePayment.create({
      data: {
        paymentHash: parsed.paymentHash,
        payerPubkey: payer,
        amountSats,
        channelId: channelId ?? null,
        messageId: messageId ?? null,
        status: 'pending',
      },
    });
    return NextResponse.json({ ok: true, paymentHash: parsed.paymentHash });
  } catch (err) {
    // Unique violation on paymentHash → someone already claimed.
    if ((err as { code?: string }).code === 'P2002') {
      const existing = await prisma.invoicePayment.findUnique({ where: { paymentHash: parsed.paymentHash } });
      const status = existing?.status === 'paid' ? 'already_paid' : 'pending';
      return NextResponse.json({ error: status }, { status: 409 });
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
