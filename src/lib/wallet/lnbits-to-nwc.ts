// src/lib/wallet/lnbits-to-nwc.ts
// Convert LNbits credentials (instance URL + admin key) into an NWC URI.
// Most LNbits installs expose the built-in NWC service plugin which mints
// connection URIs.

export interface LnbitsToNwcResult {
  nwcUri: string;
}

export async function lnbitsToNwc(
  instanceUrl: string,
  adminKey: string,
): Promise<LnbitsToNwcResult> {
  if (!instanceUrl?.trim()) throw new Error('LNbits URL is required');
  if (!adminKey?.trim()) throw new Error('LNbits admin key is required');
  const base = instanceUrl.trim().replace(/\/+$/, '');
  // The NWC service plugin path on LNbits.
  const url = `${base}/nostrwalletconnect/api/v1/pairing`;
  const res = await fetch(url, {
    headers: { 'X-Api-Key': adminKey.trim(), 'Content-Type': 'application/json' },
  });
  if (res.status === 404) throw new Error('LNbits NWC plugin not enabled on this instance');
  if (res.status === 401 || res.status === 403) throw new Error('Invalid LNbits admin key');
  if (!res.ok) throw new Error(`LNbits returned ${res.status}`);
  const body = (await res.json()) as { uri?: string };
  if (!body.uri) throw new Error('LNbits NWC response missing uri');
  return { nwcUri: body.uri };
}
