// src/lib/wallet/local-store.ts
// Per-account local wallet store. The NWC URI is encrypted with the user's
// DM cache key (random 32 bytes wrapped via NIP-44 self-encrypt). Server
// never sees plaintext credentials.

import { getOrCreateCacheKey, encryptToCache, decryptFromCache, type KEKSigner } from '@/lib/dm/cache-key';

export type WalletSource = 'quick' | 'nwc' | 'lnbits';

export interface LocalWallet {
  source: WalletSource;
  nwcUri: string;
  label?: string;
  lnbitsInstance?: string;
}

const STORAGE_PREFIX = 'obelisk:wallet:';

const keyFor = (pubkey: string): string => `${STORAGE_PREFIX}${pubkey}`;

export function hasLocalWallet(pubkey: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(keyFor(pubkey)) !== null;
}

export async function saveLocalWallet(
  pubkey: string,
  signer: KEKSigner,
  wallet: LocalWallet,
): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  const key = await getOrCreateCacheKey(pubkey, signer);
  const blob = await encryptToCache(key, JSON.stringify(wallet));
  localStorage.setItem(keyFor(pubkey), blob);
}

export async function readLocalWallet(
  pubkey: string,
  signer: KEKSigner,
): Promise<LocalWallet | null> {
  if (typeof localStorage === 'undefined') return null;
  const blob = localStorage.getItem(keyFor(pubkey));
  if (!blob) return null;
  const key = await getOrCreateCacheKey(pubkey, signer);
  const json = await decryptFromCache(key, blob);
  return JSON.parse(json) as LocalWallet;
}

export async function clearLocalWallet(pubkey: string): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(keyFor(pubkey));
}
