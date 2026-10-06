/**
 * The bridge singleton: `BridgeImpl` builds every module once
 * (`compose.ts`) and is the facade the hooks, shells and actions call. Its
 * read half is `facade-reads.ts`, its command half `facade-commands.ts`;
 * this file keeps the lifecycle, the session, the connection, the REQ
 * entry points, signing and the probes the bridge tests read.
 */
import { type Filter, type Event as NostrEvent, type EventTemplate, type VerifiedEvent } from 'nostr-tools';
import type { NipSigner } from '@/lib/nip-59';
import { type SignerLane } from './signer-queue';
import type { MessagesStatus, RelayAccessState } from './types';
import { type PersistedSession } from './session-storage';
import type { SetRelayAccessOpts, TrackedSub } from './context';
import { pageRelayHub } from './page-hub';
import { bridgeSlot } from './bridge-slot';

export { registerBridge, unregisterBridge } from './bridge-slot';
import { type RemoteSigner } from './session/bunker';
import { type PerGroupReqs } from './session/fanout';
import { ANONYMOUS_IDENTITY, disposeSession } from './session/reset';
import { buildNipSigner } from './session/nip-signer';
import { BridgeModules } from './compose';
import { BridgeCommands } from './facade-commands';
import { RequestsModule } from './subscriptions/registry';
import type { VoiceReqOptions } from './subscriptions/pinned';

// Re-exported for existing importers (index.ts, tests, read-state, voice);
// new code imports these modules directly.
export { isImportableRelayUrl } from './relay-list';
export { RELAYS_KEY, STORAGE_KEY } from './session-storage';
export { classifyAccessClose } from './relay-rejection';
export {
  DEFAULT_PROFILE_LOOKUP_RELAYS,
  PROFILE_LOOKUP_RELAYS_KEY,
  PROFILE_SYNC_CACHE_KEY,
  PROFILE_SYNC_CACHE_LIMIT,
  PROFILE_SYNC_STATE_KEY,
  getCachedKind0,
  setCachedKind0,
  type CachedKind0Event,
} from './profile-sync-cache';

export type { RemoteSigner } from './session/bunker';
export { BUNKER_AUTH_SIGNATURE_TIMEOUT_MS } from './session/bunker';

export type { PublishOpts } from './publish';

export class BridgeImpl extends BridgeCommands {
  // The facade: one instance of every module (`compose.ts`), the stores
  // the hooks and shells read, and the public surface, each method a
  // one-line delegation into the module that owns the behaviour. The
  // RelayHub owns the sockets, the AUTH memo, the leases, the reconnect
  // supervisor, the session's REQs, queries and publishes; `pageRelayHub()`
  // is the page's one hub.
  protected readonly m: BridgeModules;

  constructor() {
    super();
    const hub = pageRelayHub();
    hub.setIdentity(ANONYMOUS_IDENTITY);
    this.m = new BridgeModules(hub, {
      decryptNip04: (sender, ciphertext, lane) => this.decryptNip04(sender, ciphertext, lane),
      dispose: () => this.dispose(),
    });
  }

  // @internal Probes `bridge.test.ts` reads through `impl['...']`.
  private get relays(): string[] { return this.m.state.relays; }
  private get messageSubscribedGroups(): Set<string> { return this.m.messageState.subscribedGroups; }
  private get messageSubByGroup(): Map<string, TrackedSub> { return this.m.messageState.subByGroup; }
  private get activeGroupPriorityDeadline(): number { return this.m.messageState.priorityDeadline; }
  private get session(): PersistedSession | null { return this.m.state.session; }

  // ---- methods ---------------------------------------------------------------

  initialize(): Promise<void> {
    return this.m.login.initialize();
  }

  dispose(): void {
    this.m.connection.tearingDown = true;
    try {
      disposeSession(this.m.lifecycle);
    } finally {
      this.m.connection.tearingDown = false;
    }
    this.m.profiles.dispose();
  }

  // -- Auth --------------------------------------------------------------

  loginWithNsec(privKeyHex: string, pubKeyHex: string): Promise<void> {
    return this.m.login.loginWithNsec(privKeyHex, pubKeyHex);
  }

  loginWithNip07(pubkeyHex: string): Promise<void> {
    return this.m.login.loginWithNip07(pubkeyHex);
  }

  /** NIP-46 login from a `bunker://` URL (`session/bunker-login.ts`). */
  loginWithBunker(
    bunkerUrl: string,
    options?: { onAuthUrl?: (url: string) => void; clientSecretHex?: string; signer?: RemoteSigner },
  ): Promise<string> {
    return this.m.bunkerLogin.loginWithBunker(bunkerUrl, options);
  }

  /** NIP-46 NostrConnect (QR): a `nostrconnect://` URI for the remote signer to scan. */
  createNostrConnectSession(options?: { relay?: string; onAuthUrl?: (url: string) => void }): {
    uri: string;
    waitForConnection: () => Promise<string>;
    cancel: () => void;
  } {
    return this.m.bunkerLogin.createNostrConnectSession(options);
  }

  logout(): Promise<void> {
    return this.m.login.logout();
  }

  getPublicKey(): string | null {
    return this.session?.pubKeyHex ?? null;
  }

  // -- Connection --------------------------------------------------------

  /** Bring the active relay up and issue the session's REQs (`session/connection.ts`). */
  connect(perGroup: PerGroupReqs | null = null): Promise<void> {
    return this.m.connection.connect(perGroup);
  }

  switchRelay(url: string): Promise<void> {
    return this.m.rail.switchRelay(url);
  }

  addRelay(url: string): Promise<void> {
    return this.m.rail.addRelay(url);
  }

  removeRelay(url: string): Promise<void> {
    return this.m.rail.removeRelay(url);
  }

  // -- Subscriptions -----------------------------------------------------

  disableDirectMessages(): void {
    this.m.dm.dmInbox.disable();
  }

  ensureUserMetadata(pubkey: string): void {
    this.m.profiles.ensure(pubkey);
  }

  /** @internal Probe for `bridge.test.ts`. */
  private setMessagesStatus(groupId: string, status: MessagesStatus): void {
    this.m.messageState.setStatus(groupId, status);
  }

  /**
   * Drop the pooled connection to a relay so the next publish or REQ opens a
   * fresh one.
   *
   * `SimplePool` caches a connection per URL and hands the same object back
   * every time. When that socket is half-open, the relay closed it on its
   * five minute `max_connection_duration` and the client has not noticed,
   * every retry goes into the same dead pipe and times out identically. There
   * was no way to say "that one is gone" short of
   * `resetSessionState`, which is the login path and tears down every
   * subscription in the app.
   *
   * Closing a socket that is already dead costs nothing: the REQs on it are
   * dead too, and the hub's registry re-issues them on the new connection,
   * which the hub opens at once because the socket is held.
   */
  dropRelayConnection(url?: string): void {
    const targets = url ? [url] : [...this.relays];
    if (targets.length === 0) return;
    for (const target of targets) this.m.hub.dropSocket(target);
  }

  // -- REQs callers outside the bridge open: `subscriptions/registry.ts`.

  /** A plain REQ on the active relays (voice presence beacons, incoming voice gift wraps). */
  subscribeFilter(filter: Filter, onEvent: (ev: NostrEvent) => void): () => void {
    return this.m.reqs.subscribeFilter(filter, onEvent);
  }

  /** A mesh call's roster or signal REQ at `'voice'` priority, pinned across relay switches. */
  subscribeVoiceFilterWatched(
    filter: Filter,
    onEvent: (ev: NostrEvent) => void,
    options?: VoiceReqOptions,
  ): () => void {
    return this.m.reqs.pinned.subscribeVoice(filter, onEvent, options);
  }

  /** A watched REQ on the active relays, or on caller-named relays (merged, or pinned with `replace`). */
  subscribeFilterWatched(
    filter: Filter,
    onEvent: (ev: NostrEvent) => void,
    options?: Parameters<RequestsModule['subscribeFilterWatched']>[2],
  ): () => void {
    return this.m.reqs.subscribeFilterWatched(filter, onEvent, options);
  }

  // -- Signing: `session/signer.ts`, `session/nip-signer.ts`, `session/dm-signer.ts`.

  /**
   * Sign an arbitrary event template with the active session's signer
   * without publishing it (Blossom BUD-01 upload auth, for one).
   */
  signEventTemplate(
    template: { kind: number; content: string; tags: string[][]; created_at?: number },
  ): Promise<NostrEvent> {
    return this.m.signer.signEventTemplate(template);
  }

  /** @internal The hub's NIP-42 signer for this session; `login-race.test.ts` drives it directly. */
  private signSessionAuth(evt: EventTemplate): Promise<VerifiedEvent> {
    return this.m.signer.signSessionAuth(evt);
  }

  /** The NIP-59 signer for read-state sync and NWC; `lane` defaults to interactive on purpose (see `buildNipSigner`). */
  getNipSigner(lane: SignerLane = 'interactive'): NipSigner | null {
    return buildNipSigner(this.session, this.m.bunker, lane);
  }

  /** Best-effort display name for OS popups; never blocks on a fetch. */
  displayNameFor(pubkey: string): string {
    return this.m.profiles.displayNameFor(pubkey);
  }

  /** @internal The NIP-04 ingest, kept on the facade: `bridge.test.ts` holds {@link decryptNip04} open across an account switch. */
  private ingestIncomingDM(ev: NostrEvent): Promise<void> {
    return this.m.dm.nip04.ingestIncoming(ev);
  }

  /** @internal The NIP-04 decrypt seam the ingest and the DM signer go through (see {@link ingestIncomingDM}). */
  private decryptNip04(
    senderPubkey: string,
    ciphertext: string,
    lane: SignerLane = 'interactive',
  ): Promise<string> {
    return this.m.dm.nip04.decrypt(senderPubkey, ciphertext, lane);
  }


  // -- Relay access: `relay-access.ts`.
  waitForRelayAuth(timeoutMs: number): Promise<'ok' | 'timeout' | RelayAccessState> {
    return this.m.access.waitForAuth(timeoutMs);
  }
  private setRelayAccess(url: string, state: RelayAccessState, opts?: SetRelayAccessOpts): void {
    this.m.access.set(url, state, opts);
  }
  // -- Voice presence and pings: `voice-presence.ts`, `pings.ts`.
  getBackgroundWatchedRelays(): string[] {
    return this.m.pings.watchedRelays();
  }
  /** @internal Probe for the ping tests: a kind 9 as the live REQ or the watcher would hand it over. */
  ingestPing(relay: string, ev: NostrEvent, source: 'active' | 'background'): void {
    this.m.pings.ingestPing(relay, ev, source);
  }
}

/**
 * The page bridge, created on first use. The instance and its promise live in
 * the `globalThis` slot (`bridge-slot.ts`), so Fast Refresh re-evaluating this
 * module finds the bridge the page already has instead of building a second
 * one on the same hub. `<BridgeProvider>` adopts this same instance.
 */
export function getBridge(): Promise<BridgeImpl> {
  const slot = bridgeSlot();
  if (!slot.promise) {
    slot.promise = (async () => {
      const instance = new BridgeImpl();
      slot.instance = instance;
      await instance.initialize();
      return instance;
    })();
  }
  return slot.promise;
}

/** Returns the page bridge without creating it (`null` until something has). */
export function getBridgeImpl(): BridgeImpl | null {
  return bridgeSlot().instance;
}
