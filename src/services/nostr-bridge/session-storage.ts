/**
 * The persisted session record and its localStorage keys, with the one-time
 * migration from the pre-rename `obeliskord/*` keys. Reading and writing
 * the record is the bridge's job; the shape and the keys live here so the
 * tests and the login flow agree on them.
 */

export const STORAGE_KEY = 'obelisk-dex/session';
export const RELAYS_KEY = 'obelisk-dex/relays';
export const LEGACY_STORAGE_KEY = 'obeliskord/session';
export const LEGACY_RELAYS_KEY = 'obeliskord/relays';

/**
 * Read a localStorage value under the current key, falling back to the legacy
 * key (one-time migration: writes the value under the new key and deletes the
 * legacy entry).
 */
export function readMigrated(key: string, legacyKey: string): string | null {
  if (typeof window === 'undefined') return null;
  const cur = window.localStorage.getItem(key);
  if (cur !== null) return cur;
  const legacy = window.localStorage.getItem(legacyKey);
  if (legacy !== null) {
    window.localStorage.setItem(key, legacy);
    window.localStorage.removeItem(legacyKey);
    return legacy;
  }
  return null;
}

export interface PersistedSession {
  privKeyHex?: string;     // optional: only nsec login persists this
  pubKeyHex: string;
  loginMethod: 'nsec' | 'nip07' | 'bunker';
  relayUrl: string;
  /** NIP-46: the full bunker:// URL, used to rehydrate the signer on reload. */
  bunkerUrl?: string;
  /** NIP-46: hex-encoded local client secret key for the bunker channel. */
  bunkerLocalSecretHex?: string;
}
