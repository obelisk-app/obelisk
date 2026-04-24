import { parseJsonBody } from '@/lib/api-json';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthPubkey } from '@/lib/api-auth';
import { withClient, classifyNwcError, getWalletForPubkey } from '@/lib/nwc';

/**
 * POST /api/wallet/invoice
 *  { targetPubkey, amountSats, description? }
 *
 * Calls the TARGET user's NWC to make an invoice the caller will then pay.
 * If targetPubkey is omitted, creates an invoice on the caller's own wallet
 * (used by the "Receive" tab in the wallet UI).
 */
export async function POST(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await parseJsonBody(req);
  const { targetPubkey, amountSats, description } = body as {
    targetPubkey?: string;
    amountSats?: number;
    description?: string;
  };
  if (!amountSats || amountSats <= 0) {
    return NextResponse.json({ error: 'amountSats required' }, { status: 400 });
  }

  const receiver = targetPubkey || pubkey;
  const has = await getWalletForPubkey(receiver);
  if (!has) {
    return NextResponse.json({ error: 'target_no_wallet' }, { status: 409 });
  }

  try {
    const result = await withClient(receiver, async (c) => {
      return c.makeInvoice({
        amount: amountSats * 1000, // millisats
        description: description || 'Obelisk zap',
      });
    });
    if (!result) return NextResponse.json({ error: 'target_no_wallet' }, { status: 409 });
    return NextResponse.json({ invoice: result.invoice, paymentHash: result.payment_hash });
  } catch (err) {
    return NextResponse.json({ error: classifyNwcError(err) }, { status: 502 });
  }
}
