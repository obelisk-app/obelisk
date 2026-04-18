import { NextRequest, NextResponse } from 'next/server';
import { getAuthPubkey } from '@/lib/api-auth';
import { withClient, classifyNwcError } from '@/lib/nwc';

/**
 * POST /api/wallet/pay  { invoice }
 * Pays a BOLT11 invoice from the caller's NWC wallet.
 */
export async function POST(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { invoice } = body as { invoice?: string };
  if (!invoice || !invoice.toLowerCase().startsWith('ln')) {
    return NextResponse.json({ error: 'invalid_invoice' }, { status: 400 });
  }
  try {
    const result = await withClient(pubkey, async (c) => c.payInvoice({ invoice }));
    if (!result) return NextResponse.json({ error: 'no_wallet' }, { status: 404 });
    return NextResponse.json({ preimage: result.preimage });
  } catch (err) {
    const code = classifyNwcError(err);
    const status = code === 'insufficient_funds' ? 402 : 502;
    return NextResponse.json({ error: code }, { status });
  }
}
