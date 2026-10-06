/**
 * The session record on disk (`obelisk-dex/session`): sealing the secrets
 * once per login, writing the record, reading it back on reload (including
 * the one-time migration of a pre-vault plaintext record), and erasing it.
 *
 * `persist()` stays synchronous for its three callers (login, the restore's
 * relay repair, the relay switch): it writes the box cached by the last
 * `seal()`, and only `seal()` touches the vault. When a session with secrets
 * has no box (the browser cannot keep a key, or the write hit the quota
 * twice) the record is removed instead, so the disk never holds a secret in
 * the clear and never describes a session other than the current one.
 */
import { VaultError, isVaultAvailable, type SealedBox } from '@/lib/crypto/session-vault';
import { cacheFreeSpaceForQuota } from '../cache';
import {
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  parseStoredSession,
  sessionHasSecrets,
  storedRecordFor,
  type PersistedSession,
} from '../session-storage';
import type { StateStore } from '../state-store';
import {
  destroySessionVault,
  forgetSdkSignerStorage,
  openSessionSecrets,
  restoreNoticeFor,
  sealSessionSecrets,
  type SessionNotice,
} from './vault';

export interface PersistenceState {
  session: PersistedSession | null;
  readonly sessionNotice: StateStore<SessionNotice | null>;
}

/** What a reload found: a session to restore, or nothing (the record was absent or erased). */
export type LoadedSession = PersistedSession | null;

function removeRecord(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch { /* storage unavailable */ }
}

function write(json: string): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, json);
    return true;
  } catch {
    // Quota: sacrifice bridgeCache entries and retry once.
    try {
      if (cacheFreeSpaceForQuota()) {
        window.localStorage.setItem(STORAGE_KEY, json);
        return true;
      }
    } catch { /* fall through */ }
    return false;
  }
}

export class SessionPersistence {
  /** The box sealed for one session object; a relay switch mutates that object and keeps the box. */
  private sealed: { readonly session: PersistedSession; readonly box: SealedBox } | null = null;

  constructor(private readonly state: PersistenceState) {}

  /**
   * Seal the current session's secrets under a freshly rotated key (once per
   * login, and once when migrating a plaintext record). Returns `null` when
   * there is nothing to wait for: no secrets (NIP-07), or a browser with no
   * IndexedDB or WebCrypto, in which case `sessionNotice` already says the
   * session will not be remembered. Otherwise the promise resolves `true`
   * once a box is cached for this session; on failure the session goes on in
   * memory with the same notice. `persist()` afterwards writes or removes the
   * record accordingly.
   */
  seal(): Promise<boolean> | null {
    const session = this.state.session;
    if (!session) return null;
    if (!sessionHasSecrets(session)) {
      this.sealed = null;
      return null;
    }
    if (!isVaultAvailable()) {
      this.notRemembered();
      return null;
    }
    const isCurrent = () => this.state.session === session;
    return sealSessionSecrets(session, isCurrent).then(
      (box) => {
        if (!box || !isCurrent()) return false;
        this.sealed = { session, box };
        return true;
      },
      () => {
        if (isCurrent()) this.notRemembered();
        return false;
      },
    );
  }

  /** Write the current session's record, or remove the record when it cannot be written safely. */
  persist(): void {
    const session = this.state.session;
    if (typeof window === 'undefined' || !session) return;
    const box = this.sealed?.session === session ? this.sealed.box : null;
    if (sessionHasSecrets(session) && !box) {
      removeRecord();
      return;
    }
    if (!write(JSON.stringify(storedRecordFor(session, box)))) {
      removeRecord();
      this.notRemembered();
    }
  }

  /**
   * Read the stored record back into a session (page load). A sealed record
   * is opened; a plaintext one is migrated (sealed, rewritten, plaintext
   * gone) and, when the vault is unavailable, erased while the session goes
   * on for this visit. A record the vault cannot open is erased, the reason
   * left in `sessionNotice`, and `null` returned. Throws only on a corrupt
   * record, which the caller erases as before.
   *
   * Synchronous when there is nothing to open or seal (a NIP-07 record, or
   * no vault in this browser), so such a restore runs in the same task as it
   * did before the vault; a promise otherwise.
   */
  load(raw: string): LoadedSession | Promise<LoadedSession> {
    forgetSdkSignerStorage();
    const parsed = parseStoredSession(raw);
    if (parsed.kind === 'plaintext') {
      const session = parsed.session;
      this.state.session = session;
      const sealing = this.seal();
      if (!sealing) {
        this.persist();
        return session;
      }
      return sealing.then(() => {
        if (this.state.session !== session) return null;
        this.persist();
        return session;
      });
    }
    const { record } = parsed;
    const session: PersistedSession = {
      pubKeyHex: record.pubKeyHex,
      loginMethod: record.loginMethod,
      relayUrl: record.relayUrl,
    };
    if (!record.sealed) return session;
    const box = record.sealed;
    if (!isVaultAvailable()) return this.unopened(new VaultError('unavailable'));
    return openSessionSecrets(box, record.pubKeyHex).then(
      (secrets) => {
        Object.assign(session, secrets);
        this.sealed = { session, box };
        return session;
      },
      (err: unknown) => this.unopened(err),
    );
  }

  /** A sealed record that will not open: erase it and say why. */
  private unopened(err: unknown): null {
    removeRecord();
    this.state.sessionNotice.set(restoreNoticeFor(err));
    return null;
  }

  /** Logout: the record, the cached box, the vault key and the SDK's leftovers all go. */
  forget(): Promise<void> {
    this.sealed = null;
    removeRecord();
    forgetSdkSignerStorage();
    return destroySessionVault();
  }

  private notRemembered(): void {
    this.state.sessionNotice.set('not-remembered');
  }
}
