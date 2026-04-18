/**
 * Thin wrapper around @getalby/sdk NWCClient.
 *
 * Looks up a user's stored NWC URL, decrypts it, and returns a configured
 * client. Callers must `.close()` when done (or use `withClient`).
 */
import { NWCClient, Nip47WalletError, Nip47TimeoutError, Nip47NetworkError } from '@getalby/sdk';
import { prisma } from './db';
import { decrypt } from './crypto';

export { Nip47WalletError, Nip47TimeoutError, Nip47NetworkError };

export async function getWalletForPubkey(pubkey: string) {
  return prisma.wallet.findUnique({ where: { pubkey } });
}

export async function clientFor(pubkey: string): Promise<NWCClient | null> {
  const w = await getWalletForPubkey(pubkey);
  if (!w) return null;
  const url = decrypt(w.nwcUrlEncrypted);
  return new NWCClient({ nostrWalletConnectUrl: url });
}

export async function withClient<T>(
  pubkey: string,
  fn: (c: NWCClient) => Promise<T>,
): Promise<T | null> {
  const c = await clientFor(pubkey);
  if (!c) return null;
  try {
    return await fn(c);
  } finally {
    c.close();
  }
}

/**
 * Classify an NWC error into a stable string the API can return.
 * Mirrors bitbybit-habits payment error mapping.
 */
export function classifyNwcError(err: unknown): string {
  if (err instanceof Nip47WalletError) {
    const code = (err.code ?? '').toUpperCase();
    if (code.includes('INSUFFICIENT')) return 'insufficient_funds';
    if (code === 'QUOTA_EXCEEDED') return 'quota_exceeded';
    if (code === 'NOT_IMPLEMENTED') return 'not_implemented';
    return `wallet_error:${err.code}`;
  }
  if (err instanceof Nip47TimeoutError) return 'nwc_timeout';
  if (err instanceof Nip47NetworkError) return 'nwc_relay_error';
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  if (msg.includes('timeout')) return 'nwc_timeout';
  if (msg.includes('insufficient')) return 'insufficient_funds';
  return 'nwc_error';
}
