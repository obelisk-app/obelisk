/**
 * Becoming logged in and logged out (round 4 plan, step 18,
 * `session/login.ts`): the page-reload rehydration, the nsec and NIP-07
 * logins, the install sequence every login method ends in, and the logout.
 * The NIP-46 logins are `./bunker-login.ts`; the teardown lists are
 * `./reset.ts`. Pure move from `client.ts`.
 */
import { CodedError } from '@/utils/errors/codes';
import { SESSION_IDENTITY_ID, type Identity } from '@/lib/relay-hub';
import { resetAllClientState } from '@/services/reset';
import { ensureNotificationsStoreForAccount, useNotificationsStore } from '@/store/notifications';
import { ensureChannelPrefsStoreForAccount } from '@/store/channel-prefs';
import { cacheClearAll } from '../cache';
import { clearDecryptCache } from '../decrypt-cache';
import { resetSignerQueue } from '../signer-queue';
import { resetWrapLedger } from '../wrap-ledger';
import type { PerGroupReqs } from './fanout';
import type { LifecycleTargets } from './lifecycle';
import { SessionPersistence } from './persistence';
import { ANONYMOUS_IDENTITY, clearForLogout, resetSubscriptionState } from './reset';
import { restoreSession } from './restore';

export interface LoginDeps {
  connect(perGroup?: PerGroupReqs | null): Promise<void>;
  /** The relay rail (`./relays.ts`). */
  restoreConfiguredRelays(): void;
  ensureRelayInList(url: string): void;
  /** The facade's teardown (`BridgeImpl.dispose`). */
  dispose(): void;
}

export class LoginModule {
  /** The record on disk, its sealed secrets and the vault key (`./persistence.ts`). */
  private readonly store: SessionPersistence;

  constructor(
    private readonly t: LifecycleTargets,
    private readonly deps: LoginDeps,
  ) {
    this.store = new SessionPersistence(t.state);
  }

  /** Page load: the rail, then the stored session if there is one (`./restore.ts`). */
  initialize(): Promise<void> {
    return restoreSession(this.t, { ...this.deps, store: this.store });
  }

  async loginWithNsec(privKeyHex: string, pubKeyHex: string): Promise<void> {
    this.t.state.session = {
      privKeyHex,
      pubKeyHex,
      loginMethod: 'nsec',
      relayUrl: this.t.state.currentRelayUrl.get(),
    };
    await this.finalizeLogin();
  }

  async loginWithNip07(pubkeyHex: string): Promise<void> {
    if (typeof window === 'undefined' || !window.nostr) {
      throw new CodedError('extension-missing', 'No NIP-07 browser extension detected');
    }
    this.t.state.session = {
      pubKeyHex: pubkeyHex,
      loginMethod: 'nip07',
      relayUrl: this.t.state.currentRelayUrl.get(),
    };
    await this.finalizeLogin();
  }

  /**
   * Run the post-credential install sequence shared by all four login methods
   * (nsec, NIP-07, bunker URL, NostrConnect QR).
   *
   * Order matters:
   *   1. `seal()` then `persist()`: the secrets are sealed by the session
   *      vault under a freshly rotated key, then the record is written so a
   *      refresh during the connect handshake doesn't lose the credentials.
   *      When the browser cannot keep a key the login goes on in memory and
   *      `sessionNotice` says it will not be remembered.
   *   2. `resetSessionState()`: the hub gets the session identity (it
   *      rebinds sockets only when the pubkey changed) and the subscription
   *      bookkeeping restarts (`resetSubscriptionState`).
   *   3. `await connect()`, relay handshake + open the global subscriptions
   *      (group metadata, contact list, own profile). DM subscriptions open
   *      later only after the local DM opt-in is enabled. Resolves only
   *      once at least one relay has handshaken and the global REQs are
   *      issued. Throws on total failure.
   *   4. `isLoggedIn.set(true)`, flip the gate **last**. AppShell mounts
   *      with subscriptions already feeding store state, so there is no
   *      empty-sidebar flash and components never fire REQs into an
   *      unauthenticated socket.
   *
   * Pre-fix history: the old order set `isLoggedIn=true` *before* awaiting
   * `connect()`. AppShell rendered the chat UI immediately, components
   * subscribed to admin/member/messages while NIP-42 was still being
   * negotiated, the relay dropped those REQs silently, and the user had to
   * refresh 2-3 times for everything to populate. See
   * `docs/data-system.md`.
   */
  async finalizeLogin(): Promise<void> {
    const { t } = this;
    const { state } = t;
    state.sessionNotice.set(null);
    t.browserEvents.wire();
    const previousPubkey = state.myPubkey.get();
    if (previousPubkey && previousPubkey !== state.session?.pubKeyHex) {
      resetAllClientState();
      t.dmsByPeer.set({});
      t.dmSend.clearPending();
      t.lists.resetContactList();
      t.media.reset();
    }
    const sealing = this.store.seal();
    if (sealing) await sealing;
    this.persist();
    // Point the seen-wrap ledger at this account before `connect()` opens the
    // kind-1059 subscriptions, otherwise the first replayed wraps are decrypted
    // against an empty ledger and the reload saving is lost.
    resetWrapLedger(state.session?.pubKeyHex ?? null);
    const perGroup = this.resetSessionState();
    // Pin the active relays to the session's relay before connect(). Without
    // this, any drift between `currentRelayUrl` (what the UI shows as active)
    // and the active relays (what subs subscribe against) would silently put
    // kind 39000 on the wrong relay, symptom is "I logged in, the rail shows
    // public.obelisk.ar selected, but no channels arrive until I switch and
    // come back" because switchRelay is the only path that hard-resets them.
    const sessionRelay = state.currentRelayUrl.get();
    state.relays = [sessionRelay];
    // Paint cached groups/admins/members for `sessionRelay` instantly. On a
    // first login (cache empty after cacheClearAll on the prior logout, or
    // on a fresh device) this is a no-op and the live REQ fills the sidebar.
    // On re-login within the same browser session it gives the same instant
    // first paint that switchRelay does, so "fresh login" and "switch to
    // this relay" produce identical UX.
    t.seedCacheForRelay(sessionRelay);
    if (state.session) t.lists.seedContactListCache(state.session.pubKeyHex);
    // Point the notification log at this account and stamp the relay's
    // first-connect floor BEFORE connect() opens any kind-9 REQ. Both must
    // precede the first ingest: the account swap so mention cards don't
    // land in the unscoped store and get dropped on rehydrate, the floor
    // so a relay the user has never opened doesn't backfill 50 historical
    // mentions into the bell. `ReadStateRoot` re-runs the account ensure
    // on mount; both calls are idempotent.
    if (state.session) {
      ensureNotificationsStoreForAccount(state.session.pubKeyHex);
      ensureChannelPrefsStoreForAccount(state.session.pubKeyHex);
    }
    useNotificationsStore.getState().registerRelay(sessionRelay);
    await this.deps.connect(perGroup);
    state.myPubkey.set(state.session?.pubKeyHex ?? null);
    state.myLoginMethod.set(state.session?.loginMethod ?? null);
    state.isLoggedIn.set(true);
    // Idempotent with the `isLoggedIn` subscription; needed for an account
    // switch, where the flag stays true and the subscription doesn't fire.
    t.pings.recordRelayUse(sessionRelay);
    t.pings.syncBackgroundWatch();
    void t.profiles.syncOwn('login');
    // Best-effort, fire-and-forget: without a published kind-10050, no
    // NIP-17 client (including another Obelisk session) can find where to
    // deliver gift wraps to us, however many we send. See
    // `DmRelaysModule.ensureInboxPublished`.
    void t.dmRelays.ensureInboxPublished();
  }

  /**
   * The hub's view of the session: who signs NIP-42, and whether a signature
   * is a prompt. Installed on login; the anonymous identity replaces it on
   * logout. The hub rebinds (closes and reopens) the session's sockets only
   * when the pubkey changes, so a re-login with the same key keeps them.
   */
  private sessionIdentity(): Identity {
    const session = this.t.state.session;
    if (!session) return ANONYMOUS_IDENTITY;
    return {
      id: SESSION_IDENTITY_ID,
      pubkey: session.pubKeyHex,
      signer: (evt) => this.t.signSessionAuth(evt),
      authPolicy: 'auth-when-challenged',
      localSigner: session.loginMethod === 'nsec',
    };
  }

  /**
   * The session changed: hand the hub the new identity, then restart the
   * subscription bookkeeping. The hub closes and reopens the session's
   * sockets only when the pubkey differs from the one they were bound to (a
   * socket a relay bound to pubkey X must never be reused by Y), so a
   * re-login with the same key, and every background reconnect, keeps the
   * sockets and costs no AUTH prompt. The pool object itself is never
   * replaced: that rebuild was what multiplied signer prompts.
   */
  private resetSessionState(): PerGroupReqs {
    this.t.hub.setIdentity(this.sessionIdentity());
    return resetSubscriptionState(this.t);
  }

  async logout(): Promise<void> {
    this.t.bunker.close();
    // Queued signer ops close over the outgoing session's signer; running them
    // against the next identity would be wrong. Reject them so their awaiting
    // callers unwind instead of hanging forever. The decrypt memo holds the
    // outgoing identity's plaintext and goes with them.
    resetSignerQueue();
    clearDecryptCache();
    resetWrapLedger(null);
    this.t.state.session = null;
    this.t.state.sessionNotice.set(null);
    // The record, the vault key and any SDK leftovers. The key delete is
    // awaited after the synchronous teardown below so nothing waits on it.
    const forgotten = this.store.forget();
    // Wipe relay-scoped caches so the next identity doesn't paint with
    // the previous one's admin/member lists. See cache.ts.
    if (typeof window !== 'undefined') cacheClearAll();
    this.deps.dispose();
    clearForLogout(this.t);
    await forgotten;
  }

  /** Write the session record (sealed secrets only; see `./persistence.ts`). */
  persist(): void {
    this.store.persist();
  }
}
