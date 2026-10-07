/**
 * The persisted session record and its localStorage keys, with the one-time
 * migration from the pre-rename `obeliskord/*` keys. Reading and writing
 * the record is the bridge's job; the shape and the keys live here so the
 * tests and the login flow agree on them.
 */
import { isSealedBox, type SealedBox } from '@/lib/crypto/session-vault';

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

/**
 * The session as the bridge holds it in memory, secrets included. Since the
 * vault it is never written as is: `storedRecordFor` turns it into the
 * {@link StoredSessionV2} record, with the secrets sealed.
 */
export interface PersistedSession {
  privKeyHex?: string;     // nsec sessions only
  pubKeyHex: string;
  loginMethod: 'nsec' | 'nip07' | 'bunker';
  relayUrl: string;
  /** NIP-46: the full bunker:// URL, used to rehydrate the signer on reload. */
  bunkerUrl?: string;
  /** NIP-46: hex-encoded local client secret key for the bunker channel. */
  bunkerLocalSecretHex?: string;
}

/** The secret half of a session: sealed as one unit, never written as plain JSON. */
export type SessionSecrets = Pick<PersistedSession, 'privKeyHex' | 'bunkerLocalSecretHex' | 'bunkerUrl'>;

/**
 * What `obelisk-dex/session` holds: the public half in the clear (the login
 * gate and the marketing pages read `pubKeyHex` without the bridge) and the
 * secrets as a box sealed by the session vault (`@/lib/crypto/session-vault`).
 * `sealed` is absent for NIP-07, which has nothing secret to keep.
 */
export interface StoredSessionV2 {
  v: 2;
  pubKeyHex: string;
  loginMethod: PersistedSession['loginMethod'];
  relayUrl: string;
  sealed?: SealedBox;
}

/** nsec and bunker sessions carry secrets; NIP-07 does not. */
export function sessionHasSecrets(session: Pick<PersistedSession, 'loginMethod'>): boolean {
  return session.loginMethod !== 'nip07';
}

export function secretsOf(session: PersistedSession): SessionSecrets {
  const secrets: SessionSecrets = {};
  if (session.privKeyHex) secrets.privKeyHex = session.privKeyHex;
  if (session.bunkerLocalSecretHex) secrets.bunkerLocalSecretHex = session.bunkerLocalSecretHex;
  if (session.bunkerUrl) secrets.bunkerUrl = session.bunkerUrl;
  return secrets;
}

/**
 * The record to write for `session`. Throws when the session has secrets
 * and no sealed box: there is no path that writes a secret in the clear.
 */
export function storedRecordFor(session: PersistedSession, sealed: SealedBox | null): StoredSessionV2 {
  const record: StoredSessionV2 = {
    v: 2,
    pubKeyHex: session.pubKeyHex,
    loginMethod: session.loginMethod,
    relayUrl: session.relayUrl,
  };
  if (!sessionHasSecrets(session)) return record;
  if (!sealed) throw new Error('Refusing to store a session with secrets but no sealed box');
  return { ...record, sealed };
}

export type ParsedStoredSession =
  | { readonly kind: 'sealed'; readonly record: StoredSessionV2 }
  /** The pre-vault shape: secrets in plain JSON. Migrated on the load that finds it. */
  | { readonly kind: 'plaintext'; readonly session: PersistedSession };

const LOGIN_METHODS = new Set(['nsec', 'nip07', 'bunker']);

/** Parse the stored record. Throws on anything that is not one of the two shapes. */
export function parseStoredSession(raw: string): ParsedStoredSession {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('Session record is not an object');
  const obj = value as Record<string, unknown>;
  if (typeof obj.pubKeyHex !== 'string' || typeof obj.relayUrl !== 'string' || !LOGIN_METHODS.has(obj.loginMethod as string)) {
    throw new Error('Session record is missing its public fields');
  }
  if (obj.v === 2) {
    if (sessionHasSecrets(obj as unknown as StoredSessionV2) && !isSealedBox(obj.sealed)) {
      throw new Error('Session record has no sealed box');
    }
    return { kind: 'sealed', record: obj as unknown as StoredSessionV2 };
  }
  return { kind: 'plaintext', session: obj as unknown as PersistedSession };
}
