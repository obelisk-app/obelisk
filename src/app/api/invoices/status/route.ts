import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';

/**
 * GET /api/invoices/status?hashes=hash1,hash2,…
 *
 * Returns which of the given payment hashes have already been paid. Clients
 * call this when rendering invoice cards from message history so previously
 * paid invoices show the Paid badge without waiting for a socket event.
 */
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get('hashes') || '';
  const hashes = raw.split(',').map((h) => h.trim()).filter((h) => /^[0-9a-f]{64}$/i.test(h)).slice(0, 100);
  if (hashes.length === 0) return NextResponse.json({ paid: [] });

  const rows = await prisma.invoicePayment.findMany({
    where: { paymentHash: { in: hashes } },
    select: { paymentHash: true, payerPubkey: true, paidAt: true, amountSats: true },
  });

  return NextResponse.json({ paid: rows });
}
