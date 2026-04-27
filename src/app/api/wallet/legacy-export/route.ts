// src/app/api/wallet/legacy-export/route.ts
// One-shot per user. Returns the NWC URI + label of the existing server-side
// Wallet row and deletes it in the same DB transaction. Subsequent calls 404.
// This is the migration path from server-stored wallets to client-side local
// storage — after this commit lands, no new wallets are written server-side.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthPubkey } from '@/lib/api-auth';
import { decrypt } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const exported = await prisma.$transaction(async (tx) => {
    const w = await tx.wallet.findUnique({ where: { pubkey } });
    if (!w) return null;
    await tx.wallet.delete({ where: { pubkey } });
    return {
      nwcUri: decrypt(w.nwcUrlEncrypted),
      label: (w as { label?: string | null }).label ?? null,
    };
  });

  if (!exported) return NextResponse.json({ error: 'no_wallet' }, { status: 404 });
  return NextResponse.json(exported);
}
