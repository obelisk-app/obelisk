// src/lib/wallet/lnurl-pay.ts
// LNURL-pay (LUD-16) resolver: turn a Lightning Address into a callback URL,
// then request a BOLT11 invoice for a given amount. Used to zap another
// user without requiring them to be online.

export interface LnurlPayParams {
  callback: string;
  minSendable: number;     // millisatoshis
  maxSendable: number;     // millisatoshis
  tag: 'payRequest';
  metadata: string;        // JSON string per spec
  allowsNostr?: boolean;
  nostrPubkey?: string;
}

export interface InvoiceResponse {
  invoice: string;
  raw: unknown;
}

export async function resolveLightningAddress(address: string): Promise<LnurlPayParams> {
  const at = address.indexOf('@');
  if (at <= 0 || at === address.length - 1) {
    throw new Error('invalid lightning address');
  }
  const username = address.slice(0, at);
  const host = address.slice(at + 1);
  const url = `https://${host}/.well-known/lnurlp/${username}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lnurl resolution failed: ${res.status}`);
  return (await res.json()) as LnurlPayParams;
}

export async function requestInvoice(
  callback: string,
  amountMsat: number,
  comment?: string,
  zapRequest?: unknown,
): Promise<InvoiceResponse> {
  const params = new URLSearchParams({ amount: String(amountMsat) });
  if (comment) params.set('comment', comment);
  if (zapRequest) params.set('nostr', JSON.stringify(zapRequest));
  const sep = callback.includes('?') ? '&' : '?';
  const url = `${callback}${sep}${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`invoice request failed: ${res.status}`);
  const body = (await res.json()) as { pr?: string; status?: string; reason?: string };
  if (!body.pr) throw new Error(body.reason ?? 'no invoice in response');
  return { invoice: body.pr, raw: body };
}
