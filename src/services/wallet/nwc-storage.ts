/**
 * Where a wallet connection is kept between visits: sealed with the session
 * vault (`@/lib/crypto/session-vault`), never in the clear.
 *
 * - One record per account, `obelisk-dex/nwc:<pubkey>` in localStorage,
 *   holding only the sealed box. The URI (and with it the client secret)
 *   is inside the box, bound to `nwc:<pubkey>` as its AAD, so a box copied
 *   under another account's key does not open.
 * - Its own vault key (`wallet-key`), not the session's: the session key is
 *   rotated at every login and destroyed at logout, and the wallet record
 *   has its own lifetime. Each new connection rotates the wallet key, so a
 *   box sealed for an earlier connection can never be opened again.
 * - Only one account is logged in per browser, so a record for any other
 *   account is left over from a logout this page did not see: it is erased
 *   when an account loads its own (`forgetNwcRecords(except)`), and every
 *   record is erased by the logout path (`src/services/reset.ts`).
 */
import { VaultError, isVaultAvailable, isSealedBox, openSessionVault, type SealedBox } from '@/lib/crypto/session-vault';

export const NWC_RECORD_PREFIX = 'obelisk-dex/nwc:';
export const NWC_VAULT_KEY_ID = 'wallet-key';

/** What the box holds. The alias is cosmetic; the URI is the credential. */
export interface SealedNwcWallet {
  readonly uri: string;
  readonly alias: string | null;
}

let queue: Promise<unknown> = Promise.resolve();

/** One vault operation at a time, so a rotate never lands between another call's seal and its write. */
function serialized<T>(op: () => Promise<T>): Promise<T> {
  const next = queue.then(op, op);
  queue = next.catch(() => undefined);
  return next;
}

const aad = (account: string) => `nwc:${account}`;
export const nwcRecordKey = (account: string) => `${NWC_RECORD_PREFIX}${account}`;

const vault = () => openSessionVault({ keyId: NWC_VAULT_KEY_ID });

function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch { /* storage unavailable */ }
}

/**
 * Seal and write the account's wallet. Resolves false, writing nothing,
 * when this browser cannot keep a key (no IndexedDB, a private mode) or the
 * write fails: the connection then lasts for this visit only.
 */
export function sealNwcWallet(account: string, wallet: SealedNwcWallet): Promise<boolean> {
  if (typeof window === 'undefined' || !isVaultAvailable()) return Promise.resolve(false);
  return serialized(async () => {
    try {
      const v = await vault();
      await v.rotate();
      const box = await v.seal(new TextEncoder().encode(JSON.stringify(wallet)), aad(account));
      window.localStorage.setItem(nwcRecordKey(account), JSON.stringify({ v: 1, sealed: box }));
      return true;
    } catch {
      removeKey(nwcRecordKey(account));
      return false;
    }
  });
}

function parse(bytes: Uint8Array): SealedNwcWallet {
  const value = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  if (!value || typeof value.uri !== 'string') throw new VaultError('unlock-failed');
  return { uri: value.uri, alias: typeof value.alias === 'string' ? value.alias : null };
}

/**
 * The account's sealed wallet, or null when there is none. A record that
 * will not open (the key is gone, the box was tampered with or copied from
 * another account, the vault is unavailable) is erased and reads as none.
 */
export function openNwcWallet(account: string): Promise<SealedNwcWallet | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const key = nwcRecordKey(account);
  let box: SealedBox;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return Promise.resolve(null);
    const record = JSON.parse(raw) as { sealed?: unknown };
    if (!isSealedBox(record?.sealed)) throw new Error('not a sealed record');
    box = record.sealed;
  } catch {
    removeKey(key);
    return Promise.resolve(null);
  }
  return serialized(async () => {
    try {
      return parse(await (await vault()).open(box, aad(account)));
    } catch {
      removeKey(key);
      return null;
    }
  });
}

/** Whether `account` has a sealed wallet on disk, without opening it. */
export function hasNwcRecord(account: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(nwcRecordKey(account)) !== null;
  } catch {
    return false;
  }
}

/** Erase every wallet record but `except`'s. Synchronous: the logout path calls it. */
export function forgetNwcRecords(except: string | null = null): void {
  if (typeof window === 'undefined') return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(NWC_RECORD_PREFIX) && (except === null || key !== nwcRecordKey(except))) doomed.push(key);
    }
    doomed.forEach(removeKey);
  } catch { /* storage unavailable */ }
}

/** Erase the account's record and the wallet key. Best effort: without the record, a surviving key opens nothing. */
export function deleteNwcWallet(account: string): Promise<void> {
  if (typeof window !== 'undefined') removeKey(nwcRecordKey(account));
  return destroyNwcVaultKey();
}

export function destroyNwcVaultKey(): Promise<void> {
  if (!isVaultAvailable()) return Promise.resolve();
  return serialized(async () => {
    try {
      await (await vault()).destroy();
    } catch { /* unavailable: there is no key to delete */ }
  });
}
