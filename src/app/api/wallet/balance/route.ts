import { NextRequest, NextResponse } from 'next/server';
import { getAuthPubkey } from '@/lib/api-auth';
import { withClient, classifyNwcError } from '@/lib/nwc';

// GET /api/wallet/balance  → { balanceSats } for the caller's wallet.
export async function GET(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const result = await withClient(pubkey, async (c) => {
      const b = await c.getBalance();
      return b.balance ?? 0;
    });
    if (result === null) return NextResponse.json({ error: 'no_wallet' }, { status: 404 });
    // NWC returns millisats
    return NextResponse.json({ balanceSats: Math.floor(result / 1000) });
  } catch (err) {
    return NextResponse.json({ error: classifyNwcError(err) }, { status: 502 });
  }
}
