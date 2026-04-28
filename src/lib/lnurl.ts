/**
 * Resolve a Lightning Address (user@domain) to a BOLT11 invoice via LNURL-pay.
 *
 * Spec: https://github.com/lnurl/luds/blob/luds/16.md
 */

const ADDRESS_RE = /^[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function isLightningAddress(s: string): boolean {
  return ADDRESS_RE.test(s.trim());
}

interface LnurlPayParams {
  callback: string;
  minSendable: number; // msat
  maxSendable: number; // msat
  commentAllowed?: number;
  tag: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`http_${r.status}`);
  return r.json() as Promise<T>;
}

export async function resolveLightningAddress(
  address: string,
  amountSats: number,
  comment?: string,
): Promise<string> {
  const [user, domain] = address.trim().split('@');
  if (!user || !domain) throw new Error('invalid_address');
  const metaUrl = `https://${domain}/.well-known/lnurlp/${encodeURIComponent(user)}`;

  const params = await fetchJson<LnurlPayParams>(metaUrl);
  if (params.tag !== 'payRequest' || !params.callback) throw new Error('not_lnurl_pay');

  const amountMsat = Math.floor(amountSats) * 1000;
  if (amountMsat < params.minSendable || amountMsat > params.maxSendable) {
    throw new Error('amount_out_of_range');
  }

  const cb = new URL(params.callback);
  cb.searchParams.set('amount', String(amountMsat));
  if (comment && params.commentAllowed && params.commentAllowed > 0) {
    cb.searchParams.set('comment', comment.slice(0, params.commentAllowed));
  }

  const res = await fetchJson<{ pr?: string; status?: string; reason?: string }>(cb.toString());
  if (!res.pr) throw new Error(res.reason || 'no_invoice');
  return res.pr;
}
