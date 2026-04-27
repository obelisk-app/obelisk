// src/app/api/invoices/pay/confirm/route.ts
// Client reports the outcome of a previously claimed invoice. On 'paid' we
// promote the row to status='paid' and emit InvoicePaid for the channel
// room. On 'failed' we delete the row so anyone (including the same payer)
// can retry.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { getIO } from '@/server/api-bridge';

export async function POST(req: NextRequest) {
  const payer = await getAuthPubkey(req);
  if (!payer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { paymentHash, status, preimage } = body as {
    paymentHash?: string;
    status?: 'paid' | 'failed';
    preimage?: string;
  };
  if (!paymentHash || (status !== 'paid' && status !== 'failed')) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const row = await prisma.invoicePayment.findUnique({ where: { paymentHash } });
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (row.payerPubkey !== payer) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  if (status === 'failed') {
    await prisma.invoicePayment.delete({ where: { paymentHash } });
    return NextResponse.json({ ok: true });
  }

  await prisma.invoicePayment.update({
    where: { paymentHash },
    data: { status: 'paid', preimage: preimage ?? null },
  });

  // Emit InvoicePaid for the channel so others see it cleared.
  try {
    if (row.channelId) {
      getIO().to(`channel:${row.channelId}`).emit('InvoicePaid', {
        paymentHash,
        payerPubkey: payer,
        messageId: row.messageId,
      });
    }
  } catch {
    // bridge not bound (test mode) — non-fatal
  }

  return NextResponse.json({ ok: true });
}
