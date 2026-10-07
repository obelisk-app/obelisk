/**
 * The bridge's use of the session vault (`@/lib/crypto/session-vault`):
 * seal a session's secrets on login, open them on reload, forget the key on
 * logout, and erase what the SDK login widget may have left in plaintext.
 *
 * Every vault operation runs on one queue. A login seals after rotating the
 * key; two logins racing (or a logout racing a login) must not interleave a
 * rotate between another login's seal and its write, or the box on disk
 * would be under a key that no longer exists.
 */
import { VaultError, openSessionVault, type SealedBox } from '@/lib/crypto/session-vault';
import { secretsOf, type PersistedSession, type SessionSecrets } from './session-storage';

/**
 * What the session layer has to tell the person about storage. The first is
 * set at login, the other three when a reload could not restore a session.
 */
export type SessionNotice = 'not-remembered' | 'vault-unavailable' | 'key-missing' | 'unlock-failed';

/**
 * The keys `@nostr-wot/ui`'s login widget writes through its default,
 * plaintext `localStorageSignerStorage`: the NIP-46 pairing record (with the
 * client nsec the bunker authorised) and a "remembered" nsec. Copied rather
 * than imported so the bridge does not pull the UI package in;
 * `tests/services/nostr-bridge/session/vault.test.ts` pins them to the SDK's
 * own `SIGNER_STORAGE_KEY_*` exports.
 */
export const SDK_SIGNER_STORAGE_KEYS = ['@nostr-wot/ui:nip46', '@nostr-wot/ui:nsec'] as const;

let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(op: () => Promise<T>): Promise<T> {
  const next = queue.then(op, op);
  queue = next.catch(() => undefined);
  return next;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Rotate the vault key and seal `session`'s secrets under the new one,
 * bound to its pubkey. Resolves `null` without touching the vault when
 * `isCurrent()` says another login or a logout has replaced the session by
 * the time this one's turn comes. Throws `VaultError('unavailable')` when the
 * browser cannot keep a key.
 */
export function sealSessionSecrets(session: PersistedSession, isCurrent: () => boolean): Promise<SealedBox | null> {
  return serialized(async () => {
    if (!isCurrent()) return null;
    const vault = await openSessionVault();
    await vault.rotate();
    return vault.seal(encoder.encode(JSON.stringify(secretsOf(session))), session.pubKeyHex);
  });
}

function parseSecrets(bytes: Uint8Array): SessionSecrets {
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(bytes));
  } catch {
    throw new VaultError('unlock-failed');
  }
  if (!value || typeof value !== 'object') throw new VaultError('unlock-failed');
  const out: SessionSecrets = {};
  for (const field of ['privKeyHex', 'bunkerLocalSecretHex', 'bunkerUrl'] as const) {
    const v = (value as Record<string, unknown>)[field];
    if (v === undefined) continue;
    if (typeof v !== 'string') throw new VaultError('unlock-failed');
    out[field] = v;
  }
  return out;
}

/** Open a stored box. Throws a `VaultError` (`unavailable`, `key-missing` or `unlock-failed`). */
export function openSessionSecrets(box: SealedBox, pubKeyHex: string): Promise<SessionSecrets> {
  return serialized(async () => {
    const vault = await openSessionVault();
    return parseSecrets(await vault.open(box, pubKeyHex));
  });
}

/** Delete the vault key. Best effort: once the record is gone, a surviving key opens nothing. */
export function destroySessionVault(): Promise<void> {
  return serialized(async () => {
    try {
      await (await openSessionVault()).destroy();
    } catch { /* unavailable: there is no key to delete */ }
  });
}

/**
 * The notice for a failed restore, or `null` when the failure was not the
 * vault's (a corrupt record, erased silently as it always was).
 */
export function restoreNoticeFor(err: unknown): SessionNotice | null {
  if (!(err instanceof VaultError)) return null;
  if (err.code === 'unavailable') return 'vault-unavailable';
  if (err.code === 'key-missing') return 'key-missing';
  return 'unlock-failed';
}

/** Erase the SDK login widget's plaintext leftovers (written before the in-memory storage). */
export function forgetSdkSignerStorage(): void {
  if (typeof window === 'undefined') return;
  for (const key of SDK_SIGNER_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch { /* storage unavailable */ }
  }
}
