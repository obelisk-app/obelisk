import { NextRequest, NextResponse } from 'next/server';
import { getAuthPubkey } from '@/lib/api-auth';
import { withClient, classifyNwcError } from '@/lib/nwc';
import { isLightningAddress, resolveLightningAddress } from '@/lib/lnurl';

/**
 * POST /api/wallet/pay
 *   { invoice }                                    — pay a BOLT11 invoice
 *   { address, amountSats, comment? }              — pay a Lightning Address (LNURL-pay)
 */
export async function POST(req: NextRequest) {
  const pubkey = await getAuthPubkey(req);
  if (!pubkey) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { invoice: rawInvoice, address, amountSats, comment } = body as {
    invoice?: string;
    address?: string;
    amountSats?: number;
    comment?: string;
  };

  let invoice = rawInvoice?.trim();

  if (!invoice && address) {
    if (!isLightningAddress(address)) {
      return NextResponse.json({ error: 'invalid_address' }, { status: 400 });
    }
    const amt = Number(amountSats);
    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json({ error: 'invalid_amount' }, { status: 400 });
    }
    try {
      invoice = await resolveLightningAddress(address, amt, comment);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'lnurl_error';
      return NextResponse.json({ error: `lnurl:${reason}` }, { status: 502 });
    }
  }

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
