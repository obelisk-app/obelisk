// src/app/api/wallet/zap-receipt/route.ts
// Audit log only. Records a zap that already happened client-side via local
// NWC + LNURL-pay. The server holds NO wallet credentials and does NOT
// initiate the payment — this endpoint is purely a write-only log so the
// sidebar can show received zaps live and analytics can sum them up.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { getIO } from '@/server/api-bridge';

export async function POST(req: NextRequest) {
  const payer = await getAuthPubkey(req);
  if (!payer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { targetPubkey, amountMsat, channelId, messageId, paymentHash } = body as {
    targetPubkey?: string;
    amountMsat?: number;
    channelId?: string;
    messageId?: string;
    paymentHash?: string;
  };
  if (!targetPubkey || typeof targetPubkey !== 'string') return NextResponse.json({ error: 'invalid target' }, { status: 400 });
  if (typeof amountMsat !== 'number' || amountMsat <= 0) return NextResponse.json({ error: 'invalid amount' }, { status: 400 });
  if (!paymentHash || typeof paymentHash !== 'string') return NextResponse.json({ error: 'invalid paymentHash' }, { status: 400 });

  const zap = await prisma.zap.create({
    data: {
      payerPubkey: payer,
      targetPubkey,
      amountMsat: BigInt(amountMsat),
      channelId: channelId ?? null,
      messageId: messageId ?? null,
      paymentHash,
    },
  });

  // Best-effort live notification (target room may not be connected).
  try {
    getIO().to(`pubkey:${targetPubkey}`).emit('ZapReceived', {
      payerPubkey: payer,
      amountMsat,
      channelId: channelId ?? null,
      messageId: messageId ?? null,
      paymentHash,
      at: zap.createdAt,
    });
  } catch {
    // socket bridge may not be initialized in test runs — non-fatal
  }

  return NextResponse.json({ ok: true });
}
