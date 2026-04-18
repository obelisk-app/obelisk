import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { encrypt } from '@/lib/crypto';

// GET /api/wallet  → { connected, label } (never returns the NWC URL)
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const w = await prisma.wallet.findUnique({ where: { pubkey } });
  return NextResponse.json({
    connected: !!w,
    label: w?.label ?? null,
    createdAt: w?.createdAt ?? null,
  });
}

// PUT /api/wallet  { nwcUrl, label? }
export async function PUT(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { nwcUrl, label } = body as { nwcUrl?: string; label?: string };
  if (!nwcUrl || !nwcUrl.startsWith('nostr+walletconnect://')) {
    return NextResponse.json({ error: 'Invalid NWC URL' }, { status: 400 });
  }
  const nwcUrlEncrypted = encrypt(nwcUrl);
  const w = await prisma.wallet.upsert({
    where: { pubkey },
    update: { nwcUrlEncrypted, label: label ?? null },
    create: { pubkey, nwcUrlEncrypted, label: label ?? null },
  });
  return NextResponse.json({ connected: true, label: w.label });
}

// DELETE /api/wallet
export async function DELETE(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.wallet.deleteMany({ where: { pubkey } });
  return NextResponse.json({ ok: true });
}
