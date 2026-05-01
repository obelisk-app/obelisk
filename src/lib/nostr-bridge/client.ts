/**
 * Bridge implementation backed by `nostr-tools`.
 *
 * Why a TS implementation rather than the planned KMP→WASM bridge:
 *   The Kotlin/Wasm `@JsExport` constraints in Kotlin 2.2.20 don't allow
 *   exporting non-`external` classes as return types of interop functions
 *   (compile error: "Type 'NostrBridge' cannot be used as return type of
 *   JS interop function. Only external, primitive, string, and function
 *   types are supported"). Building the WASM bridge requires a flat-module
 *   redesign with JSON-string returns or `external interface` types — a
 *   nontrivial rewrite that needs hands-on iteration.
 *
 *   nostr-tools uses the same crypto primitives nostrord uses (secp256k1,
 *   NIP-04 ChaCha-poly hybrid, NIP-44 ChaCha20-Poly1305). The protocol
 *   layer is the same; only the host language differs. Components import
 *   from this single seam, so a future swap to the WASM artifact is
 *   mechanical (replace this file's body).
 *
 *   See `nostrord/composeApp/src/wasmJsMain/.../bridge/README.md` (deleted
 *   when the broken first-draft was reverted) and obeliskord/HANDOFF.md
 *   for the WASM swap recipe.
 */
import { SimplePool, type Filter, type Event as NostrEvent, type EventTemplate, type VerifiedEvent, finalizeEvent, getPublicKey, nip19, nip04 } from 'nostr-tools';
import { BunkerSigner, parseBunkerInput, createNostrConnectURI } from 'nostr-tools/nip46';
import { generateSecretKey } from 'nostr-tools/pure';
import { parseRelayListMeta, parseInboxRelays } from '@/lib/nostr-read';
import { TextCoercingWebSocket } from '@/lib/nostr-pool';
import { cacheGet, cacheSet, cacheClearAll, cacheListIds } from './cache';
import { resetAllClientState } from '@/lib/reset';
import type {
  NostrBridge,
  JsGroup,
  JsMessage,
  JsUserMetadata,
  JsReaction,
  JsDirectMessage,
  Unsubscribe,
} from './types';

// -- NIP-29 kinds --------------------------------------------------------
const KIND_GROUP_MESSAGE = 9;
const KIND_GROUP_METADATA = 39000;
const KIND_GROUP_JOIN_REQUEST = 9021;
const KIND_GROUP_LEAVE_REQUEST = 9022;
const KIND_USER_METADATA = 0;
const KIND_REACTION = 7;
const KIND_DIRECT_MESSAGE = 4;
const KIND_GROUP_CREATE = 9007;
const KIND_GROUP_EDIT_METADATA = 9002;
const KIND_GROUP_PUT_USER = 9000;
const KIND_GROUP_REMOVE_USER = 9001;
const KIND_GROUP_DELETE_EVENT = 9005;
const KIND_GROUP_ADMINS = 39001;
const KIND_GROUP_MEMBERS = 39002;

export const STORAGE_KEY = 'obelisk-dex/session';
export const RELAYS_KEY = 'obelisk-dex/relays';
const LEGACY_STORAGE_KEY = 'obeliskord/session';
const LEGACY_RELAYS_KEY = 'obeliskord/relays';
const DEFAULT_RELAY = 'wss://relay.obelisk.ar';

/**
 * Read a localStorage value under the current key, falling back to the legacy
 * key (one-time migration: writes the value under the new key and deletes the
 * legacy entry).
 */
function readMigrated(key: string, legacyKey: string): string | null {
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

// Outbox/profile relays for fetching kind:0 metadata. NIP-29 group relays
// generally don't carry user profile events, so we query well-known public
// relays in addition to the active group relay.
const PROFILE_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://purplepag.es',
];

interface PersistedSession {
  privKeyHex?: string;     // optional: only nsec login persists this
  pubKeyHex: string;
  loginMethod: 'nsec' | 'nip07' | 'bunker';
  relayUrl: string;
  /** NIP-46: full bunker:// URL — used to rehydrate the signer on reload. */
  bunkerUrl?: string;
  /** NIP-46: hex-encoded local client secret key for the bunker channel. */
  bunkerLocalSecretHex?: string;
}

const NOSTRCONNECT_RELAYS = ['wss://relay.nsec.app', 'wss://relay.damus.io', 'wss://nos.lol'];

type Listener<T> = (value: T) => void;

class StateStore<T> {
  private value: T;
  private listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  set(next: T): void {
    if (next === this.value) return;
    this.value = next;
    this.listeners.forEach((l) => l(next));
  }

  update(fn: (prev: T) => T): void {
    this.set(fn(this.value));
  }

  subscribe(cb: Listener<T>): Unsubscribe {
    this.listeners.add(cb);
    cb(this.value);
    return () => {
      this.listeners.delete(cb);
    };
  }
}

class BridgeImpl implements NostrBridge {
  private pool: SimplePool;
  private relays: string[] = [DEFAULT_RELAY];
  private session: PersistedSession | null = null;
  private subs: Array<{ close: () => void }> = [];
  private activeGroupId: string | null = null;
  /** Active NIP-46 signer (when loginMethod === 'bunker'). Reconstructed lazily. */
  private bunkerSigner: BunkerSigner | null = null;
  /** Set by the modal so it can show the auth-challenge URL. */
  private bunkerOnAuth: ((url: string) => void) | null = null;

  constructor() {
    this.pool = this.createPool();
  }

  /**
   * Create a SimplePool with NIP-42 automatic authentication.
   * When the relay sends an AUTH challenge, the pool signs a kind-22242
   * event with the current session key and sends it back automatically.
   */
  private createPool(): SimplePool {
    return new SimplePool({
      // Some relays (or compressing proxies) push EVENT/EOSE frames as
      // binary. nostr-tools' default parser does `json.slice(...).indexOf(...)`
      // unconditionally and crashes on any non-string payload, silently
      // dropping events. TextCoercingWebSocket UTF-8-decodes binary frames
      // before the parser sees them. Same fix as `getNostrPool()`.
      websocketImplementation: TextCoercingWebSocket as unknown as typeof WebSocket,
      automaticallyAuth: (_relayUrl: string) => {
        if (!this.session) return null;
        return async (evt: EventTemplate): Promise<VerifiedEvent> => {
          if (this.session?.loginMethod === 'nsec' && this.session.privKeyHex) {
            const sk = hexToBytes(this.session.privKeyHex);
            return finalizeEvent(evt, sk) as VerifiedEvent;
          }
          if (this.session?.loginMethod === 'nip07') {
            const win = (window as any).nostr;
            if (!win) throw new Error('NIP-07 extension unavailable');
            return (await win.signEvent(evt)) as VerifiedEvent;
          }
          if (this.session?.loginMethod === 'bunker') {
            const b = await this.ensureBunkerSigner();
            return (await b.signEvent(evt as unknown as EventTemplate & { pubkey: string })) as VerifiedEvent;
          }
          throw new Error('Cannot sign auth event with current login method');
        };
      },
    } as ConstructorParameters<typeof SimplePool>[0]);
  }

  // Reactive state
  isLoggedIn = new StateStore(false);
  connectionState = new StateStore<string>('Disconnected');
  currentRelayUrl = new StateStore<string>(DEFAULT_RELAY);
  configuredRelays = new StateStore<string[]>([DEFAULT_RELAY]);
  groups = new StateStore<JsGroup[]>([]);
  messagesByGroup = new StateStore<Record<string, JsMessage[]>>({});
  userMetadata = new StateStore<Record<string, JsUserMetadata>>({});
  reactionsByGroup = new StateStore<Record<string, Record<string, JsReaction[]>>>({});
  childrenByParent = new StateStore<Record<string, string[]>>({});
  dmsByPeer = new StateStore<Record<string, JsDirectMessage[]>>({});
  adminsByGroup = new StateStore<Record<string, string[]>>({});
  membersByGroup = new StateStore<Record<string, string[]>>({});
  /**
   * Per-group flag flipped to `true` once the relay has delivered at least
   * one kind 39001 (admins) or 39002 (members) event for that group. The
   * voice-channel membership gate uses this as positive evidence the relay
   * is actually responding before deciding "not-a-member" — without it, a
   * slow NIP-42 round-trip looks identical to "user is not a member" and
   * users have to refresh to recover.
   */
  membershipReadyByGroup = new StateStore<Record<string, boolean>>({});
  myFollows = new StateStore<string[]>([]);
  /**
   * `true` once the active NIP-46 bunker signer has completed its handshake
   * with the bunker relay (or the user logged in via nsec/NIP-07 — those
   * methods don't have an external signer to wait for, so they never set this
   * to `true`; consumers that need a generic "ready to publish" flag should
   * derive it from `(loginMethod !== 'bunker') || bunkerSignerReady`).
   * Pre-warmed during {@link initialize} on page reload to avoid a cold
   * `BunkerSigner.connect()` round-trip during the first NIP-42 AUTH.
   */
  bunkerSignerReady = new StateStore<boolean>(false);
  /**
   * Reactive mirror of `session?.pubKeyHex`. Plain `getPublicKey()` is a
   * one-shot read; this store lets React components subscribe so they
   * re-render on login/logout without manual wiring.
   */
  myPubkey = new StateStore<string | null>(null);
  /**
   * Reactive mirror of `session?.loginMethod`. Lets components derive
   * "do I need to wait for a remote signer?" without reaching into
   * the bridge's private session.
   */
  myLoginMethod = new StateStore<'nsec' | 'nip07' | 'bunker' | null>(null);

  // Pubkeys we've already requested kind:0 for, to avoid duplicate subscriptions.
  private metadataRequested = new Set<string>();
  // Group ids we already have a message subscription for.
  private messageSubscribedGroups = new Set<string>();
  // Group ids we already have a reaction subscription for.
  private reactionSubscribedGroups = new Set<string>();
  private dmSubscribed = false;
  private adminMemberSubscribedGroups = new Set<string>();
  // Newest `created_at` we've seen for kind-39001 (admins) / kind-39002
  // (members) per group id. Used to drop out-of-order ingests so an older
  // revision arriving second from a slower relay can't clobber the newer
  // list — the symptom of that race is the admin badge / settings gear /
  // members rail flickering on/off until the user refreshes.
  private adminMemberLatestAt = new Map<string, number>();
  /**
   * After {@link resetPoolForSessionChange} rebuilds the pool, the global
   * subscriptions get re-issued by {@link connect}, but per-group REQs
   * (messages, reactions, admin/member, kind-0 metadata) are owned by mounted
   * components that already called `subscribeMessages` / `subscribeAdminMember`
   * / `ensureUserMetadata` once on mount. Components don't re-call those after
   * login — their store listeners are still wired up — so without this
   * snapshot the new pool has no REQs for any of them and the user has to
   * refresh until the relay is asked again. We capture the previously-active
   * per-group subscriptions before reset and re-issue them after reconnect.
   */
  private pendingResubscribe: {
    messages: string[];
    reactions: string[];
    adminMember: string[];
    metadata: string[];
  } | null = null;
  // Per-pubkey cache of recipient NIP-65 read relays (where they read DMs).
  // Populated on first sendDirectMessage to that pubkey; TTL'd to avoid
  // requerying every send.
  private recipientReadRelaysCache = new Map<string, { relays: string[]; fetchedAt: number }>();
  // Own NIP-17 inbox + NIP-65 relays — wider than `this.relays`. Used to
  // subscribe for incoming DMs published to relays the user actually reads.
  private myDmRelays: string[] = [];

  async initialize(): Promise<void> {
    if (typeof window !== 'undefined') {
      const rawRelays = readMigrated(RELAYS_KEY, LEGACY_RELAYS_KEY);
      if (rawRelays) {
        try {
          const list = JSON.parse(rawRelays) as string[];
          if (Array.isArray(list) && list.length > 0) {
            this.configuredRelays.set(list);
          }
        } catch {
          // ignore
        }
      }
    }
    const raw = readMigrated(STORAGE_KEY, LEGACY_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as PersistedSession;
      this.session = parsed;
      this.currentRelayUrl.set(parsed.relayUrl);
      this.relays = [parsed.relayUrl];
      // Make sure the session relay is in the configured list.
      this.ensureRelayInList(parsed.relayUrl);
      // Seed admin/member StateStores from localStorage so the sidebar paints
      // last-known admin status instantly while the live REQ catches up.
      // Stale-while-revalidate: arriving relay events overwrite via the
      // newest-wins logic in ingestAdminMember.
      this.seedCacheForRelay(parsed.relayUrl);
      // For NIP-46 (bunker) sessions: pre-warm the BunkerSigner so the first
      // NIP-42 AUTH challenge from the relay doesn't trigger a cold
      // BunkerSigner.fromBunker + signer.connect() round-trip from inside
      // the auth-signing callback. Many relays time out the AUTH window
      // before the cold path completes, the REQ is dropped silently, the
      // watchdog retries, and the user sees the "needs 2-3 refreshes" bug.
      // Fire-and-forget on purpose: a flaky bunker relay must not block
      // chat render — the lazy fallback in getAuthSigner still works.
      if (parsed.loginMethod === 'bunker') {
        void this.ensureBunkerSigner()
          .then(() => this.bunkerSignerReady.set(true))
          .catch((err) => {
            console.warn(
              '[bridge] bunker pre-warm failed; will retry lazily on first AUTH',
              err,
            );
          });
      }
      // Order matters: connect() opens subscriptions, then we flip the gate.
      // If we set isLoggedIn=true first, AppShell mounts and fires per-group
      // REQs against an unauthenticated socket — relays drop them silently
      // and the user is left needing 2-3 manual refreshes. See finalizeLogin
      // and docs/auth-and-data-loading.md.
      try {
        await this.connect();
      } catch {
        // Connect failed (no relays reachable, etc.). Keep the persisted
        // session in memory so a later switchRelay/retry can use it, but
        // do NOT flip isLoggedIn — the UI will keep showing LoginModal.
        return;
      }
      this.myPubkey.set(parsed.pubKeyHex);
      this.myLoginMethod.set(parsed.loginMethod);
      this.isLoggedIn.set(true);
    } catch {
      // bad storage, ignore
    }
  }

  private ensureRelayInList(url: string): void {
    const list = this.configuredRelays.get();
    if (list.includes(url)) return;
    const next = [...list, url];
    this.configuredRelays.set(next);
    this.persistRelays();
  }

  private persistRelays(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(RELAYS_KEY, JSON.stringify(this.configuredRelays.get()));
  }

  dispose(): void {
    this.subs.forEach((s) => s.close());
    this.subs = [];
    this.pool.close(this.relays);
  }

  // -- Auth --------------------------------------------------------------

  async loginWithNsec(privKeyHex: string, pubKeyHex: string): Promise<void> {
    this.session = {
      privKeyHex,
      pubKeyHex,
      loginMethod: 'nsec',
      relayUrl: this.currentRelayUrl.get(),
    };
    await this.finalizeLogin();
  }

  async loginWithNip07(pubkeyHex: string): Promise<void> {
    if (typeof window === 'undefined' || !(window as any).nostr) {
      throw new Error('No NIP-07 browser extension detected');
    }
    this.session = {
      pubKeyHex: pubkeyHex,
      loginMethod: 'nip07',
      relayUrl: this.currentRelayUrl.get(),
    };
    await this.finalizeLogin();
  }

  /**
   * Seed in-memory admin/member stores from {@link cacheGet} for `relay`.
   *
   * Called by {@link initialize} (page reload) and {@link switchRelay} (relay
   * switch) so the sidebar paints last-known admin/member status instantly,
   * before the relay's response to the live REQ has arrived. The live event
   * (when it lands in {@link ingestAdminMember}) then overwrites the cache
   * value via the existing `created_at`-newest-wins logic.
   *
   * Relay-scoped: each relay has its own admin/member lists, so we only seed
   * for the active relay. Caches for other relays stay on disk untouched
   * (they re-paint instantly if the user switches back).
   */
  private seedCacheForRelay(relay: string): void {
    for (const groupId of cacheListIds(relay, KIND_GROUP_ADMINS)) {
      const entry = cacheGet<string[]>(relay, KIND_GROUP_ADMINS, groupId);
      if (entry) {
        this.adminsByGroup.update((prev) => ({ ...prev, [groupId]: entry.value }));
        this.membershipReadyByGroup.update((prev) =>
          prev[groupId] ? prev : { ...prev, [groupId]: true },
        );
      }
    }
    for (const groupId of cacheListIds(relay, KIND_GROUP_MEMBERS)) {
      const entry = cacheGet<string[]>(relay, KIND_GROUP_MEMBERS, groupId);
      if (entry) {
        this.membersByGroup.update((prev) => ({ ...prev, [groupId]: entry.value }));
        this.membershipReadyByGroup.update((prev) =>
          prev[groupId] ? prev : { ...prev, [groupId]: true },
        );
      }
    }
  }

  /**
   * Run the post-credential install sequence shared by all four login methods
   * (nsec, NIP-07, bunker URL, NostrConnect QR) and the page-reload rehydration
   * path in {@link initialize}.
   *
   * Order matters:
   *   1. `persist()` — write session to localStorage so a refresh during the
   *      connect handshake doesn't lose the credentials.
   *   2. `resetPoolForSessionChange()` — fresh sockets so NIP-42 AUTH
   *      renegotiates with the new key (see that method's JSDoc).
   *   3. `await connect()` — relay handshake + open the global subscriptions
   *      (group metadata, DMs, contact list, own profile). Resolves only
   *      once at least one relay has handshaken and the global REQs are
   *      issued. Throws on total failure.
   *   4. `isLoggedIn.set(true)` — flip the gate **last**. AppShell mounts
   *      with subscriptions already feeding store state, so there is no
   *      empty-sidebar flash and components never fire REQs into an
   *      unauthenticated socket.
   *
   * Pre-fix history: the old order set `isLoggedIn=true` *before* awaiting
   * `connect()`. AppShell rendered the chat UI immediately, components
   * subscribed to admin/member/messages while NIP-42 was still being
   * negotiated, the relay dropped those REQs silently, and the user had to
   * refresh 2-3 times for everything to populate. See
   * `docs/auth-and-data-loading.md`.
   */
  private async finalizeLogin(): Promise<void> {
    this.persist();
    this.resetPoolForSessionChange();
    await this.connect();
    this.myPubkey.set(this.session?.pubKeyHex ?? null);
    this.myLoginMethod.set(this.session?.loginMethod ?? null);
    this.isLoggedIn.set(true);
  }

  /**
   * Tear down sockets and rebuild the pool when the session changes.
   * SimplePool resolves `automaticallyAuth(relayUrl)` per challenge, but the
   * underlying Relay caches AUTH-handshake state on the open socket. If the
   * pool was opened earlier without a session, the relay can settle into a
   * no-auth state and silently filter out auth-required reads — symptom is
   * "channels load but messages inside don't". A fresh socket forces a new
   * AUTH round-trip with the just-installed session.
   */
  private resetPoolForSessionChange(): void {
    // Capture the per-group REQs that were live on the old pool so connect()
    // can reopen them on the new one. Without this, components mounted before
    // login keep their store listeners but have nothing feeding them.
    this.pendingResubscribe = {
      messages: Array.from(this.messageSubscribedGroups),
      reactions: Array.from(this.reactionSubscribedGroups),
      adminMember: Array.from(this.adminMemberSubscribedGroups),
      metadata: Array.from(this.metadataRequested),
    };
    this.subs.forEach((s) => s.close());
    this.subs = [];
    try { this.pool.close(this.relays); } catch { /* ignore */ }
    this.pool = this.createPool();
    this.messageSubscribedGroups.clear();
    this.reactionSubscribedGroups.clear();
    this.adminMemberSubscribedGroups.clear();
    this.adminMemberLatestAt.clear();
    this.metadataRequested.clear();
    // Clear the per-group readiness flags too — the new pool has not seen
    // 39001/39002 yet, so consumers must wait for fresh evidence before
    // deciding "not a member".
    this.membershipReadyByGroup.set({});
    this.dmSubscribed = false;
  }

  /**
   * NIP-46 login from a `bunker://` URL.
   * The local client secret is generated fresh per login and persisted in
   * localStorage so the signer can be rehydrated on page reload.
   */
  async loginWithBunker(bunkerUrl: string, options?: { onAuthUrl?: (url: string) => void }): Promise<string> {
    const bp = await parseBunkerInput(bunkerUrl);
    if (!bp) throw new Error('Invalid bunker URL');
    const localSecret = generateSecretKey();
    this.bunkerOnAuth = options?.onAuthUrl ?? null;
    const signer = BunkerSigner.fromBunker(localSecret, bp, {
      onauth: (url) => {
        if (this.bunkerOnAuth) this.bunkerOnAuth(url);
        else if (typeof window !== 'undefined') window.open(url, '_blank', 'width=600,height=700');
      },
    });
    await signer.connect();
    const pubKeyHex = await signer.getPublicKey();
    this.bunkerSigner = signer;
    this.session = {
      pubKeyHex,
      loginMethod: 'bunker',
      relayUrl: this.currentRelayUrl.get(),
      bunkerUrl,
      bunkerLocalSecretHex: bytesToHex(localSecret),
    };
    this.bunkerSignerReady.set(true);
    await this.finalizeLogin();
    return pubKeyHex;
  }

  /**
   * NIP-46 NostrConnect (QR) flow — generates a `nostrconnect://` URI for the
   * remote signer to scan. Caller is expected to render the URI as a QR code
   * and `await waitForConnection()` to resolve once the signer connects.
   */
  createNostrConnectSession(options?: { relay?: string; onAuthUrl?: (url: string) => void }): {
    uri: string;
    waitForConnection: () => Promise<string>;
    cancel: () => void;
  } {
    const localSecret = generateSecretKey();
    const localPubkey = getPublicKey(localSecret);
    const connectRelay = options?.relay || NOSTRCONNECT_RELAYS[0];
    const uri = createNostrConnectURI({
      clientPubkey: localPubkey,
      relays: [connectRelay, ...NOSTRCONNECT_RELAYS],
      secret: Math.random().toString(36).substring(2, 15),
      name: 'Obelisk',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://obelisk.ar',
    });

    let cancelled = false;
    const waitForConnection = async (): Promise<string> => {
      this.bunkerOnAuth = options?.onAuthUrl ?? null;
      const signer = await BunkerSigner.fromURI(localSecret, uri, {
        onauth: (url) => {
          if (this.bunkerOnAuth) this.bunkerOnAuth(url);
        },
      }, 60000);
      if (cancelled) {
        try { signer.close(); } catch { /* ignore */ }
        throw new Error('NostrConnect cancelled');
      }
      const pubKeyHex = await signer.getPublicKey();
      // Reconstruct a bunker:// URL from the signer's resolved BunkerPointer
      // so we can persist + rehydrate later.
      const bp = (signer as unknown as { bp: { pubkey: string; relays: string[]; secret?: string } }).bp;
      const params = new URLSearchParams();
      bp.relays.forEach((r) => params.append('relay', r));
      if (bp.secret) params.set('secret', bp.secret);
      const bunkerUrl = `bunker://${bp.pubkey}?${params.toString()}`;
      this.bunkerSigner = signer;
      this.session = {
        pubKeyHex,
        loginMethod: 'bunker',
        relayUrl: this.currentRelayUrl.get(),
        bunkerUrl,
        bunkerLocalSecretHex: bytesToHex(localSecret),
      };
      this.bunkerSignerReady.set(true);
      await this.finalizeLogin();
      return pubKeyHex;
    };

    return {
      uri,
      waitForConnection,
      cancel: () => { cancelled = true; },
    };
  }

  /**
   * Lazily (re)construct the active BunkerSigner from the persisted session.
   *
   * Contract:
   *   - On a fresh login (`loginWithBunker` / `createNostrConnectSession`),
   *     the signer is constructed and connected eagerly before this method is
   *     ever consulted; `this.bunkerSigner` is already set.
   *   - On page reload, `initialize()` pre-warms by calling this method once
   *     fire-and-forget. After it resolves, subsequent NIP-42 AUTH callbacks
   *     hit the cached signer instantly.
   *   - If pre-warm failed (bunker relay down) or `initialize` hasn't run yet,
   *     the first NIP-42 AUTH triggers this lazy path: parse bunker URL,
   *     reconstruct localSecret, build BunkerSigner, await its connect()
   *     handshake, then sign. This adds 1-3s of latency but is the fallback
   *     of last resort.
   */
  private async ensureBunkerSigner(): Promise<BunkerSigner> {
    if (this.bunkerSigner) return this.bunkerSigner;
    if (!this.session || this.session.loginMethod !== 'bunker' || !this.session.bunkerUrl || !this.session.bunkerLocalSecretHex) {
      throw new Error('No bunker session to rehydrate');
    }
    const bp = await parseBunkerInput(this.session.bunkerUrl);
    if (!bp) throw new Error('Invalid stored bunker URL');
    const localSecret = hexToBytes(this.session.bunkerLocalSecretHex);
    const signer = BunkerSigner.fromBunker(localSecret, bp, {
      onauth: (url) => {
        if (this.bunkerOnAuth) this.bunkerOnAuth(url);
        else if (typeof window !== 'undefined') window.open(url, '_blank', 'width=600,height=700');
      },
    });
    await signer.connect();
    this.bunkerSigner = signer;
    return signer;
  }

  async logout(): Promise<void> {
    if (this.bunkerSigner) {
      try { this.bunkerSigner.close(); } catch { /* ignore */ }
      this.bunkerSigner = null;
    }
    this.session = null;
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      // Wipe relay-scoped caches so the next identity doesn't paint with
      // the previous one's admin/member lists. See cache.ts.
      cacheClearAll();
    }
    this.dispose();
    this.pool = this.createPool();
    this.isLoggedIn.set(false);
    this.bunkerSignerReady.set(false);
    this.myPubkey.set(null);
    this.myLoginMethod.set(null);
    this.connectionState.set('Disconnected');
    this.groups.set([]);
    this.messagesByGroup.set({});
    this.adminsByGroup.set({});
    this.membersByGroup.set({});
    this.membershipReadyByGroup.set({});
    // Clear chat / notification / voice / DM stores so the next user logging
    // in on this browser doesn't inherit the previous account's data. See
    // src/lib/reset.ts for the full enumeration.
    resetAllClientState();
  }

  getPublicKey(): string | null {
    return this.session?.pubKeyHex ?? null;
  }

  // -- Connection --------------------------------------------------------

  async connect(): Promise<void> {
    this.connectionState.set('Connecting');
    try {
      // SimplePool.subscribe is lazy and synchronous — it doesn't wait for
      // the WebSocket handshake, so previously every relay (even bogus
      // ones) appeared "Connected" instantly. ensureRelay actually awaits
      // the handshake and rejects on timeout / refused / DNS failure.
      //
      // Use allSettled, not all: if any single relay is slow/down/blocked,
      // we still want to fire subscriptions on the relays that did connect.
      // Previously one flaky relay (out of 5 defaults) would reject the
      // whole connect and leave the UI empty until the user refreshed.
      const results = await Promise.allSettled(
        this.relays.map(async (url) => {
          validateRelayUrl(url);
          const relay = await this.pool.ensureRelay(url, { connectionTimeout: 5000 });
          if (!relay.connected) throw new Error(`relay ${url} did not complete handshake`);
          // Flip status back if the socket drops later.
          relay.onclose = () => {
            if (this.relays.includes(url)) {
              this.connectionState.set('Disconnected');
            }
          };
          return url;
        }),
      );
      const connectedCount = results.filter((r) => r.status === 'fulfilled').length;
      if (connectedCount === 0) {
        const firstError = results.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
        throw new Error(firstError ? String(firstError.reason?.message ?? firstError.reason) : 'no relays connected');
      }
      this.subscribeGroupMetadata();
      this.subscribeIncomingDMs();
      this.subscribeMyContactList();
      // Resolve the user's own profile so the UI has it immediately.
      if (this.session) this.ensureUserMetadata(this.session.pubKeyHex);
      // Reopen any per-group REQs that were live on the previous pool.
      // Components that mounted pre-login (or pre-relay-switch) still have
      // their store listeners wired up; without this re-issue the new pool
      // has no subscriptions feeding them and the data only appears after
      // a manual refresh.
      const pending = this.pendingResubscribe;
      this.pendingResubscribe = null;
      if (pending) {
        pending.messages.forEach((id) => this.subscribeGroupMessages(id));
        pending.reactions.forEach((id) => this.subscribeGroupReactions(id));
        pending.adminMember.forEach((id) => this.subscribeAdminMember(id));
        pending.metadata.forEach((pk) => this.ensureUserMetadata(pk));
      }
      this.connectionState.set('Connected');
    } catch (e: unknown) {
      this.connectionState.set(`Error:${(e as Error).message}`);
      throw e;
    }
  }

  async switchRelay(url: string): Promise<void> {
    this.subs.forEach((s) => s.close());
    this.subs = [];
    this.pool.close(this.relays);
    this.pool = this.createPool();
    this.relays = [url];
    this.currentRelayUrl.set(url);
    this.ensureRelayInList(url);
    if (this.session) this.session.relayUrl = url;
    this.persist();
    this.groups.set([]);
    this.messagesByGroup.set({});
    // Reset per-group caches: they're scoped to one relay.
    this.messageSubscribedGroups.clear();
    this.reactionSubscribedGroups.clear();
    this.adminMemberSubscribedGroups.clear();
    this.adminMemberLatestAt.clear();
    this.metadataRequested.clear();
    this.adminsByGroup.set({});
    this.membersByGroup.set({});
    // Reset readiness too — the new relay hasn't delivered evidence yet.
    // Without this, voice gates and member rails would still be marked
    // "loaded" from the previous relay's data.
    this.membershipReadyByGroup.set({});
    this.dmSubscribed = false;
    // Re-paint instantly from disk for the new relay; live events will
    // overwrite as they arrive. See {@link seedCacheForRelay}.
    this.seedCacheForRelay(url);
    await this.connect();
  }

  async addRelay(url: string): Promise<void> {
    const trimmed = url.trim();
    if (!trimmed) return;
    validateRelayUrl(trimmed);
    // Verify the relay is actually reachable before persisting it. Use a
    // throwaway pool so a failed probe doesn't pollute the live pool's
    // internal relay map, and so we can guarantee the socket is closed.
    const probe = new SimplePool({
      websocketImplementation: TextCoercingWebSocket as unknown as typeof WebSocket,
    } as ConstructorParameters<typeof SimplePool>[0]);
    try {
      const relay = await probe.ensureRelay(trimmed, { connectionTimeout: 5000 });
      if (!relay.connected) throw new Error('relay did not complete handshake');
    } finally {
      try { probe.close([trimmed]); } catch { /* ignore */ }
    }
    if (!this.relays.includes(trimmed)) this.relays.push(trimmed);
    this.ensureRelayInList(trimmed);
  }

  async removeRelay(url: string): Promise<void> {
    const list = this.configuredRelays.get().filter((u) => u !== url);
    if (list.length === 0) return; // never empty the rail
    this.configuredRelays.set(list);
    this.persistRelays();
    if (this.currentRelayUrl.get() === url) {
      await this.switchRelay(list[0]);
    }
  }

  subscribeConfiguredRelays(cb: (urls: ReadonlyArray<string>) => void): Unsubscribe {
    return this.configuredRelays.subscribe(cb);
  }

  // -- Subscriptions -----------------------------------------------------

  subscribeIsLoggedIn(cb: (v: boolean) => void): Unsubscribe {
    return this.isLoggedIn.subscribe(cb);
  }
  subscribeConnectionState(cb: (label: string) => void): Unsubscribe {
    return this.connectionState.subscribe(cb);
  }
  subscribeCurrentRelayUrl(cb: (url: string) => void): Unsubscribe {
    return this.currentRelayUrl.subscribe(cb);
  }
  subscribeMyPubkey(cb: (pubkey: string | null) => void): Unsubscribe {
    return this.myPubkey.subscribe(cb);
  }
  subscribeMyLoginMethod(cb: (m: 'nsec' | 'nip07' | 'bunker' | null) => void): Unsubscribe {
    return this.myLoginMethod.subscribe(cb);
  }
  subscribeBunkerSignerReady(cb: (ready: boolean) => void): Unsubscribe {
    return this.bunkerSignerReady.subscribe(cb);
  }
  subscribeGroups(cb: (groups: ReadonlyArray<JsGroup>) => void): Unsubscribe {
    return this.groups.subscribe(cb);
  }
  subscribeMessages(groupId: string, cb: (msgs: ReadonlyArray<JsMessage>) => void): Unsubscribe {
    // Belt-and-braces: messages start streaming as soon as group metadata
    // arrives (see ingestGroupMetadata). This call is idempotent and only
    // matters for groups the user opens via deep link before metadata lands.
    this.subscribeGroupMessages(groupId);
    const adapter: Listener<Record<string, JsMessage[]>> = (byGroup) => cb(byGroup[groupId] ?? []);
    return this.messagesByGroup.subscribe(adapter);
  }
  subscribeUserMetadata(pubkey: string, cb: (meta: JsUserMetadata | null) => void): Unsubscribe {
    this.ensureUserMetadata(pubkey);
    const adapter: Listener<Record<string, JsUserMetadata>> = (m) => cb(m[pubkey] ?? null);
    return this.userMetadata.subscribe(adapter);
  }

  subscribeReactions(
    groupId: string,
    cb: (byTarget: Readonly<Record<string, ReadonlyArray<JsReaction>>>) => void,
  ): Unsubscribe {
    this.subscribeGroupReactions(groupId);
    const adapter: Listener<Record<string, Record<string, JsReaction[]>>> = (all) =>
      cb(all[groupId] ?? {});
    return this.reactionsByGroup.subscribe(adapter);
  }

  subscribeChildrenByParent(
    cb: (byParent: Readonly<Record<string, ReadonlyArray<string>>>) => void,
  ): Unsubscribe {
    return this.childrenByParent.subscribe(cb);
  }

  subscribeDirectMessages(
    cb: (byPeer: Readonly<Record<string, ReadonlyArray<JsDirectMessage>>>) => void,
  ): Unsubscribe {
    if (!this.dmSubscribed) this.subscribeIncomingDMs();
    return this.dmsByPeer.subscribe(cb);
  }

  subscribeMyFollows(cb: (pubkeys: ReadonlyArray<string>) => void): Unsubscribe {
    return this.myFollows.subscribe(cb);
  }

  subscribeAdmins(groupId: string, cb: (admins: ReadonlyArray<string>) => void): Unsubscribe {
    this.subscribeAdminMember(groupId);
    const adapter: Listener<Record<string, string[]>> = (byGroup) => cb(byGroup[groupId] ?? []);
    return this.adminsByGroup.subscribe(adapter);
  }

  subscribeAdminsByGroup(
    cb: (byGroup: Readonly<Record<string, ReadonlyArray<string>>>) => void,
  ): Unsubscribe {
    return this.adminsByGroup.subscribe(cb);
  }

  subscribeMembers(groupId: string, cb: (members: ReadonlyArray<string>) => void): Unsubscribe {
    this.subscribeAdminMember(groupId);
    const adapter: Listener<Record<string, string[]>> = (byGroup) => cb(byGroup[groupId] ?? []);
    return this.membersByGroup.subscribe(adapter);
  }

  /**
   * Subscribe to the "relay has delivered at least one 39001/39002 for this
   * group" signal. Fires `false` immediately on subscribe (or `true` if a
   * membership event was already observed), then `true` when the first event
   * lands. Callers should also call {@link subscribeMembers} /
   * {@link subscribeAdmins} so the underlying REQ is open.
   */
  subscribeMembershipReady(groupId: string, cb: (ready: boolean) => void): Unsubscribe {
    this.subscribeAdminMember(groupId);
    const adapter: Listener<Record<string, boolean>> = (m) => cb(!!m[groupId]);
    return this.membershipReadyByGroup.subscribe(adapter);
  }

  ensureUserMetadata(pubkey: string): void {
    if (this.metadataRequested.has(pubkey)) return;
    this.metadataRequested.add(pubkey);
    this.subscribeKind0(pubkey);
  }

  // -- Group operations --------------------------------------------------

  async sendMessage(groupId: string, content: string, replyTo?: { id: string; pubkey: string } | null): Promise<void> {
    const tags: string[][] = [['h', groupId]];
    if (replyTo) {
      tags.push(['e', replyTo.id, '', 'reply']);
      tags.push(['p', replyTo.pubkey]);
    }
    const event = await this.signAndPublish({
      kind: KIND_GROUP_MESSAGE,
      content,
      tags,
      created_at: Math.floor(Date.now() / 1000),
    });
    this.ingestMessage(groupId, event);
  }

  async sendReaction(targetEventId: string, targetPubkey: string, emoji: string, groupId: string): Promise<void> {
    const event = await this.signAndPublish({
      kind: KIND_REACTION,
      content: emoji,
      tags: [
        ['e', targetEventId],
        ['p', targetPubkey],
        ['h', groupId],
      ],
      created_at: Math.floor(Date.now() / 1000),
    });
    this.ingestReaction(groupId, event);
  }

  async sendDirectMessage(recipientPubkey: string, content: string): Promise<void> {
    if (!this.session) throw new Error('Not logged in');
    const cipher = await this.encryptNip04(recipientPubkey, content);
    // NIP-04 DMs are delivered to the recipient's NIP-65 read relays; without
    // this, sends to anyone whose read set doesn't include `this.relays` will
    // never reach them. Failure to look up just falls back to `this.relays`.
    const extraRelays = await this.fetchRecipientReadRelays(recipientPubkey).catch(() => [] as string[]);
    const event = await this.signAndPublish(
      {
        kind: KIND_DIRECT_MESSAGE,
        content: cipher,
        tags: [['p', recipientPubkey]],
        created_at: Math.floor(Date.now() / 1000),
      },
      extraRelays,
    );
    // Optimistic local ingest — also avoids depending on relay echo of own DMs.
    this.ingestDM(event, content, /*outgoing*/ true, recipientPubkey);
  }

  async joinGroup(groupId: string): Promise<void> {
    await this.signAndPublish({
      kind: KIND_GROUP_JOIN_REQUEST,
      content: '',
      tags: [['h', groupId]],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  async leaveGroup(groupId: string): Promise<void> {
    await this.signAndPublish({
      kind: KIND_GROUP_LEAVE_REQUEST,
      content: '',
      tags: [['h', groupId]],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  async createGroup(opts: {
    groupId?: string;
    name: string;
    about?: string;
    picture?: string;
    banner?: string;
    isPublic?: boolean;
    isOpen?: boolean;
    kind?: 'text' | 'voice';
  }): Promise<string> {
    const groupId = opts.groupId ?? generateGroupId();
    await this.signAndPublish({
      kind: KIND_GROUP_CREATE,
      content: '',
      tags: [['h', groupId]],
      created_at: Math.floor(Date.now() / 1000),
    });
    // NIP-29 says the relay SHOULD make the creator the first admin, but in
    // practice some relays only emit kind 39001 once an explicit kind 9000
    // ['p', creator, 'admin'] is published. Without this the creator opens
    // their own freshly-made channel and the gear icon doesn't show up.
    // Belt-and-braces: explicitly claim admin for the creator. Idempotent on
    // relays that already did the right thing.
    if (this.session) {
      try {
        await this.putUser(groupId, this.session.pubKeyHex, ['admin']);
      } catch (err) {
        // Some relays reject self-elevation when they already auto-elevated
        // the creator — that's fine, swallow.
        console.warn('[bridge] createGroup: claim-admin putUser failed', err);
      }
    }
    await this.editGroupMetadata({ ...opts, groupId });
    return groupId;
  }

  async putUser(groupId: string, pubkey: string, roles?: ReadonlyArray<string>): Promise<void> {
    const pTag: string[] = ['p', pubkey];
    if (roles && roles.length > 0) pTag.push(...roles);
    await this.signAndPublish({
      kind: KIND_GROUP_PUT_USER,
      content: '',
      tags: [['h', groupId], pTag],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  async removeUser(groupId: string, pubkey: string): Promise<void> {
    await this.signAndPublish({
      kind: KIND_GROUP_REMOVE_USER,
      content: '',
      tags: [['h', groupId], ['p', pubkey]],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  async deleteGroupEvent(groupId: string, eventId: string): Promise<void> {
    await this.signAndPublish({
      kind: KIND_GROUP_DELETE_EVENT,
      content: '',
      tags: [['h', groupId], ['e', eventId]],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  async editGroupMetadata(opts: {
    groupId: string;
    name?: string;
    about?: string;
    picture?: string;
    banner?: string;
    isPublic?: boolean;
    isOpen?: boolean;
    kind?: 'text' | 'voice';
  }): Promise<void> {
    const tags: string[][] = [['h', opts.groupId]];
    if (opts.name !== undefined) tags.push(['name', opts.name]);
    if (opts.about !== undefined) tags.push(['about', opts.about]);
    if (opts.picture !== undefined) tags.push(['picture', opts.picture]);
    if (opts.banner !== undefined) tags.push(['banner', opts.banner]);
    if (opts.isPublic !== undefined) tags.push([opts.isPublic ? 'public' : 'private']);
    if (opts.isOpen !== undefined) tags.push([opts.isOpen ? 'open' : 'closed']);
    // The voice marker is "just another tag" on kind 9002; the relay reflects
    // it on kind 39000 like name/about. Omitting the tag (kind: 'text') makes
    // a previously-voice channel revert to a regular text channel.
    if (opts.kind === 'voice') tags.push(['t', 'voice']);
    await this.signAndPublish({
      kind: KIND_GROUP_EDIT_METADATA,
      content: '',
      tags,
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  async searchMessages(opts: {
    query?: string;
    groupIds?: ReadonlyArray<string>;
    authors?: ReadonlyArray<string>;
    mentions?: ReadonlyArray<string>;
    has?: ReadonlyArray<'link' | 'image' | 'file'>;
    since?: number;
    until?: number;
    limit?: number;
  }): Promise<ReadonlyArray<JsMessage & { groupId: string | null }>> {
    const filter: Filter & { search?: string } = {
      kinds: [KIND_GROUP_MESSAGE],
      limit: opts.limit ?? 50,
    };
    if (opts.query && opts.query.trim()) filter.search = opts.query.trim();
    if (opts.authors && opts.authors.length > 0) filter.authors = [...opts.authors];
    if (opts.mentions && opts.mentions.length > 0) (filter as Record<string, unknown>)['#p'] = [...opts.mentions];
    if (opts.groupIds && opts.groupIds.length > 0) (filter as Record<string, unknown>)['#h'] = [...opts.groupIds];
    if (opts.since) filter.since = opts.since;
    if (opts.until) filter.until = opts.until;
    const events = await this.pool.querySync(this.relays, filter, { maxWait: 4000 });
    const has = new Set(opts.has ?? []);
    const URL_RE = /https?:\/\/\S+/i;
    const IMG_RE = /https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif|svg)(?:\?\S*)?/i;
    const FILE_RE = /https?:\/\/\S+\.(?:pdf|zip|tar|gz|mp3|mp4|mov|webm|wav|csv|json|txt|md)(?:\?\S*)?/i;
    const matches = (content: string) => {
      if (has.size === 0) return true;
      if (has.has('image') && !IMG_RE.test(content)) return false;
      if (has.has('file') && !FILE_RE.test(content)) return false;
      if (has.has('link') && !URL_RE.test(content)) return false;
      return true;
    };
    return events
      .filter((e) => matches(e.content))
      .map((e) => ({
        id: e.id,
        pubkey: e.pubkey,
        content: e.content,
        createdAt: e.created_at,
        kind: e.kind,
        replyToId: e.tags.find((t) => t[0] === 'e')?.[1] ?? null,
        groupId: e.tags.find((t) => t[0] === 'h')?.[1] ?? null,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async editUserMetadata(opts: {
    name?: string;
    displayName?: string;
    about?: string;
    picture?: string;
    banner?: string;
    nip05?: string;
    website?: string;
    lud16?: string;
  }): Promise<void> {
    if (!this.session) throw new Error('Not logged in');
    const me = this.session.pubKeyHex;
    const profileRelays = Array.from(new Set([...this.relays, ...PROFILE_RELAYS]));

    let existing: Record<string, unknown> = {};
    try {
      const ev = await this.pool.get(profileRelays, { kinds: [KIND_USER_METADATA], authors: [me] });
      if (ev) existing = JSON.parse(ev.content) as Record<string, unknown>;
    } catch {
      // ignore — start from empty
    }

    const merged: Record<string, unknown> = { ...existing };
    if (opts.name !== undefined) merged.name = opts.name;
    if (opts.displayName !== undefined) merged.display_name = opts.displayName;
    if (opts.about !== undefined) merged.about = opts.about;
    if (opts.picture !== undefined) merged.picture = opts.picture;
    if (opts.banner !== undefined) merged.banner = opts.banner;
    if (opts.nip05 !== undefined) merged.nip05 = opts.nip05;
    if (opts.website !== undefined) merged.website = opts.website;
    if (opts.lud16 !== undefined) merged.lud16 = opts.lud16;

    await this.signAndPublish({
      kind: KIND_USER_METADATA,
      content: JSON.stringify(merged),
      tags: [],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  async loadMoreMessages(_groupId: string): Promise<boolean> {
    // Pagination not yet implemented — relays return all current messages
    // on initial subscribe via this minimal client. A full implementation
    // tracks the oldest seen `created_at` and re-subscribes with `until`.
    return false;
  }

  markGroupAsRead(_groupId: string): void {
    // No-op in this minimal client. Real impl would persist a per-group
    // last-read timestamp and recompute unread counts.
  }

  setActiveGroup(groupId: string | null): void {
    this.activeGroupId = groupId;
  }

  // -- Voice channels ---------------------------------------------------

  /** Read-once snapshot of admins for a group; subscribes if not already. */
  getAdmins(groupId: string): readonly string[] {
    this.subscribeAdminMember(groupId);
    return this.adminsByGroup.get()[groupId] ?? [];
  }

  /** Read-once snapshot of members for a group; subscribes if not already. */
  getMembers(groupId: string): readonly string[] {
    this.subscribeAdminMember(groupId);
    return this.membersByGroup.get()[groupId] ?? [];
  }

  // -- Voice / ephemeral primitives -------------------------------------

  /**
   * Publish a pre-built event template as the active session, returning the
   * signed event. Same machinery as `signAndPublish` but exposed for callers
   * (e.g. voice presence beacons, gift-wrapped voice signaling) that need to
   * publish events outside the NIP-29 group flow. Not part of the JS-exported
   * `NostrBridge` surface; reach for it via `getBridgeImpl()`.
   */
  async publishEvent(template: {
    kind: number;
    content: string;
    tags: string[][];
    created_at?: number;
  }, extraRelays: string[] = []): Promise<NostrEvent> {
    return this.signAndPublish(
      {
        kind: template.kind,
        content: template.content,
        tags: template.tags,
        created_at: template.created_at ?? Math.floor(Date.now() / 1000),
      },
      extraRelays,
    );
  }

  /**
   * Subscribe to events on the configured relays matching `filter`. Returns
   * an unsubscribe function. NIP-42 auth is handled by the same signer the
   * rest of the pool uses. Used by voice for presence beacons and incoming
   * gift wraps. Filters apply per-relay; standard nostr-tools semantics.
   */
  subscribeFilter(filter: Filter, onEvent: (ev: NostrEvent) => void): () => void {
    const sub = this.pool.subscribe(this.relays, filter, {
      onevent: onEvent,
      onauth: this.getAuthSigner(),
    });
    return () => sub.close();
  }

  // -- Internals ---------------------------------------------------------

  /**
   * Wrap `pool.subscribe` with a per-subscription watchdog.
   *
   * On first load (and after relay/session resets) a relay's NIP-42 AUTH
   * round-trip can race past the initial REQ, or a transient network blip
   * can drop the sub silently. Symptoms: categories render but channels
   * don't; messages stay empty until the user refreshes 2-3 times.
   *
   * If neither an EVENT nor an EOSE arrives within `watchdogMs`, we close
   * the sub and re-issue it (with backoff, up to `maxAttempts`). EOSE alone
   * is enough to consider the sub alive — even if the relay has nothing
   * stored, EOSE proves the REQ is live and live events will stream.
   *
   * Tunable rationale:
   *   - `watchdogMs`: how long to wait for *any* response before assuming
   *     the REQ was dropped. 5000ms is a conservative default that tolerates
   *     a slow NIP-42 round-trip + initial query on a backed-up relay. Lower
   *     this for non-critical paths where a missed retry just means stale
   *     UX for a few seconds.
   *   - `maxAttempts`: how many times to retry before giving up. 4 with
   *     exponential backoff (1s/2s/4s/8s) caps total wait at ~27s, which is
   *     "I'll wait this long before I refuse to declare bankruptcy on this
   *     subscription". Lower this for non-critical paths.
   *
   * Critical paths (group metadata, group messages, admin/member, DMs,
   * contact list) keep the 5000/4 default — losing them means an empty
   * UI. Non-critical paths (kind:0 metadata, reactions) override with
   * tighter values: a missed reaction just delays an emoji badge.
   */
  private subscribeWatched(
    relays: string[],
    filter: Filter,
    onevent: (ev: NostrEvent) => void,
    oneose?: () => void,
    options?: { watchdogMs?: number; maxAttempts?: number },
  ): { close: () => void } {
    const WATCHDOG_MS = options?.watchdogMs ?? 5000;
    const MAX_ATTEMPTS = options?.maxAttempts ?? 4;
    let attempt = 0;
    let activeSub: { close: () => void } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let alive = false;

    const clearTimer = () => {
      if (timer) { clearTimeout(timer); timer = null; }
    };

    let authPending = false;
    const baseSigner = this.getAuthSigner();
    // Wrap the onauth signer so the watchdog can pause while the user is
    // approving a NIP-42 AUTH challenge in their extension / bunker. Without
    // this, a slow human approval (>watchdogMs) closes the sub before
    // nostr-tools can re-fire the REQ on the now-authed socket — and each
    // watchdog retry triggers a fresh extension prompt instead of riding
    // the existing AUTH. Symptom: user approves the signature, then has to
    // refresh the page for channels/messages to populate.
    const wrappedSigner = baseSigner
      ? async (evt: EventTemplate): Promise<VerifiedEvent> => {
          authPending = true;
          clearTimer();
          try {
            return await baseSigner(evt);
          } finally {
            authPending = false;
            // Give the relay a moment to deliver EVENT/EOSE on the retried
            // REQ before the watchdog can decide the sub is dead.
            if (!closed && !alive) {
              timer = setTimeout(onWatchdog, WATCHDOG_MS);
            }
          }
        }
      : undefined;

    const onWatchdog = () => {
      if (closed || alive) return;
      if (authPending) {
        // Don't kill the sub while a human is staring at an approval popup.
        timer = setTimeout(onWatchdog, WATCHDOG_MS);
        return;
      }
      try { activeSub?.close(); } catch { /* ignore */ }
      activeSub = null;
      if (attempt < MAX_ATTEMPTS) {
        const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
        timer = setTimeout(start, delay);
      }
    };

    const start = () => {
      if (closed) return;
      attempt++;
      alive = false;
      const sub = this.pool.subscribe(relays, filter, {
        onevent: (ev) => {
          alive = true;
          clearTimer();
          onevent(ev);
        },
        oneose: () => {
          alive = true;
          clearTimer();
          oneose?.();
        },
        onauth: wrappedSigner,
      });
      activeSub = sub;
      timer = setTimeout(onWatchdog, WATCHDOG_MS);
    };

    start();

    return {
      close: () => {
        closed = true;
        clearTimer();
        try { activeSub?.close(); } catch { /* ignore */ }
      },
    };
  }

  /**
   * Return a signing function suitable for `onauth` params in pool.subscribe
   * and pool.publish. When the relay sends CLOSED "auth-required:…" the pool
   * uses this to authenticate and retry the operation automatically.
   */
  /**
   * Sign an arbitrary event template with the active session's signer
   * (nsec → finalizeEvent, nip07 → window.nostr.signEvent). Used by callers
   * that need a signed event without publishing it — e.g. Blossom BUD-01
   * upload-auth events that travel in the HTTP Authorization header.
   */
  async signEventTemplate(
    template: { kind: number; content: string; tags: string[][]; created_at?: number },
  ): Promise<NostrEvent> {
    if (!this.session) throw new Error('Not logged in');
    const fullTemplate = {
      kind: template.kind,
      content: template.content,
      tags: template.tags,
      created_at: template.created_at ?? Math.floor(Date.now() / 1000),
      pubkey: this.session.pubKeyHex,
    } as EventTemplate & { pubkey: string };
    if (this.session.loginMethod === 'nsec' && this.session.privKeyHex) {
      const sk = hexToBytes(this.session.privKeyHex);
      return finalizeEvent(fullTemplate, sk) as NostrEvent;
    }
    if (this.session.loginMethod === 'nip07') {
      const win = (window as any).nostr;
      if (!win) throw new Error('NIP-07 extension unavailable');
      return (await win.signEvent(fullTemplate)) as NostrEvent;
    }
    if (this.session.loginMethod === 'bunker') {
      const b = await this.ensureBunkerSigner();
      return (await b.signEvent(fullTemplate)) as NostrEvent;
    }
    throw new Error(`Login method ${this.session.loginMethod} cannot sign events in this build`);
  }

  private getAuthSigner(): ((evt: EventTemplate) => Promise<VerifiedEvent>) | undefined {
    if (!this.session) return undefined;
    return async (evt: EventTemplate): Promise<VerifiedEvent> => {
      if (this.session?.loginMethod === 'nsec' && this.session.privKeyHex) {
        const sk = hexToBytes(this.session.privKeyHex);
        return finalizeEvent(evt, sk) as VerifiedEvent;
      }
      if (this.session?.loginMethod === 'nip07') {
        const win = (window as any).nostr;
        if (!win) throw new Error('NIP-07 extension unavailable');
        return (await win.signEvent(evt)) as VerifiedEvent;
      }
      if (this.session?.loginMethod === 'bunker') {
        const b = await this.ensureBunkerSigner();
        return (await b.signEvent(evt as unknown as EventTemplate & { pubkey: string })) as VerifiedEvent;
      }
      throw new Error('Cannot sign auth event with current login method');
    };
  }

  private subscribeGroupMetadata(): void {
    const filter: Filter = { kinds: [KIND_GROUP_METADATA] };
    const sub = this.subscribeWatched(this.relays, filter, (ev) => this.ingestGroupMetadata(ev));
    this.subs.push(sub);
  }

  private subscribeGroupMessages(groupId: string): void {
    if (this.messageSubscribedGroups.has(groupId)) return;
    this.messageSubscribedGroups.add(groupId);
    const filter: Filter = {
      kinds: [KIND_GROUP_MESSAGE],
      '#h': [groupId],
      limit: 200,
    };
    const sub = this.subscribeWatched(this.relays, filter, (ev) => this.ingestMessage(groupId, ev));
    this.subs.push(sub);
  }

  private subscribeKind0(pubkey: string): void {
    const filter: Filter = { kinds: [KIND_USER_METADATA], authors: [pubkey] };
    const relays = Array.from(new Set([...this.relays, ...PROFILE_RELAYS]));
    // Non-critical path: a missing kind:0 just shows the npub instead of a
    // display name. Tighter watchdog/retry to fail fast and free socket budget.
    const sub = this.subscribeWatched(
      relays,
      filter,
      (ev) => this.ingestUserMetadata(ev),
      undefined,
      { watchdogMs: 3000, maxAttempts: 2 },
    );
    this.subs.push(sub);
  }

  private subscribeGroupReactions(groupId: string): void {
    if (this.reactionSubscribedGroups.has(groupId)) return;
    this.reactionSubscribedGroups.add(groupId);
    const filter: Filter = { kinds: [KIND_REACTION], '#h': [groupId], limit: 500 };
    // Non-critical path: a missing reaction event just delays an emoji badge.
    const sub = this.subscribeWatched(
      this.relays,
      filter,
      (ev) => this.ingestReaction(groupId, ev),
      undefined,
      { watchdogMs: 3000, maxAttempts: 2 },
    );
    this.subs.push(sub);
  }

  private subscribeAdminMember(groupId: string): void {
    if (this.adminMemberSubscribedGroups.has(groupId)) return;
    this.adminMemberSubscribedGroups.add(groupId);
    const filter: Filter = {
      kinds: [KIND_GROUP_ADMINS, KIND_GROUP_MEMBERS],
      '#d': [groupId],
    };
    const sub = this.subscribeWatched(this.relays, filter, (ev) => this.ingestAdminMember(ev));
    this.subs.push(sub);
  }

  private ingestAdminMember(ev: NostrEvent): void {
    const groupId = ev.tags.find((t) => t[0] === 'd')?.[1];
    if (!groupId) return;
    // Drop older revisions arriving out-of-order from slower relays. Without
    // this, admins/members lists oscillate as different relays return
    // different snapshots and the React UI flickers (gear icon disappears,
    // members rail empties, etc.) until a refresh.
    const cacheKey = `${ev.kind}:${groupId}`;
    const prevAt = this.adminMemberLatestAt.get(cacheKey) ?? 0;
    if (ev.created_at <= prevAt) return;
    this.adminMemberLatestAt.set(cacheKey, ev.created_at);

    const pubkeys = ev.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
    const store = ev.kind === KIND_GROUP_ADMINS ? this.adminsByGroup : this.membersByGroup;
    store.update((prev) => ({ ...prev, [groupId]: pubkeys }));
    // Persist for next reload — paints instantly before the relay round-trip
    // completes. See cache.ts. Scoped by relay so cross-relay browsing
    // doesn't leak admin lists.
    cacheSet(this.currentRelayUrl.get(), ev.kind, groupId, pubkeys);
    // Positive signal: the relay has delivered membership data for this
    // group, even if the list is empty. Consumers (voice gate) can now
    // distinguish "not loaded yet" from "loaded and you're not in it".
    this.membershipReadyByGroup.update((prev) =>
      prev[groupId] ? prev : { ...prev, [groupId]: true },
    );
    pubkeys.forEach((pk) => this.ensureUserMetadata(pk));
  }

  private subscribeMyContactList(): void {
    if (!this.session) return;
    const filter: Filter = { kinds: [3], authors: [this.session.pubKeyHex], limit: 1 };
    // Kind 3 (NIP-02 contact list) is rarely on the dex's NIP-29 relay —
    // users publish it to their general-purpose relays (damus, nos.lol, …).
    // Subscribing only on `this.relays` left the Follows tab perpetually
    // empty for anyone whose contact list lives elsewhere.
    const relays = Array.from(new Set([...this.relays, ...PROFILE_RELAYS]));
    let latestCreatedAt = 0;
    const sub = this.subscribeWatched(relays, filter, (ev) => {
      // Multiple relays may return different revisions of kind 3; keep the
      // newest by created_at so an older replica doesn't clobber a newer one.
      if (ev.created_at <= latestCreatedAt) return;
      latestCreatedAt = ev.created_at;
      const pubkeys = ev.tags.filter((t) => t[0] === 'p').map((t) => t[1]);
      this.myFollows.set(pubkeys);
      pubkeys.forEach((pk) => this.ensureUserMetadata(pk));
    });
    this.subs.push(sub);
  }

  private subscribeIncomingDMs(): void {
    if (!this.session || this.dmSubscribed) return;
    this.dmSubscribed = true;
    const me = this.session.pubKeyHex;
    // DMs to me (kind 4 with #p = me) and from me (authored by me).
    const filterIn: Filter = { kinds: [KIND_DIRECT_MESSAGE], '#p': [me], limit: 200 };
    const filterOut: Filter = { kinds: [KIND_DIRECT_MESSAGE], authors: [me], limit: 200 };
    for (const f of [filterIn, filterOut]) {
      const sub = this.subscribeWatched(this.relays, f, (ev) => this.ingestIncomingDM(ev));
      this.subs.push(sub);
    }
    // Wide-net pickup: other clients publish DMs to the user's own NIP-17
    // (10050) inbox or NIP-65 (10002) read/write relays — not necessarily
    // `this.relays`. Resolve those, then add a parallel subscription.
    void this.fetchMyDmRelays().then((urls) => {
      const extras = urls.filter((u) => !this.relays.includes(u));
      if (extras.length === 0) return;
      this.myDmRelays = extras;
      for (const f of [filterIn, filterOut]) {
        const sub = this.subscribeWatched(extras, f, (ev) => this.ingestIncomingDM(ev));
        this.subs.push(sub);
      }
    });
  }

  private ingestGroupMetadata(ev: NostrEvent): void {
    const tag = (name: string) => ev.tags.find((t) => t[0] === name)?.[1];
    const groupId = tag('d');
    if (!groupId) return;
    const isPublic = ev.tags.some((t) => t[0] === 'public');
    const isOpen = ev.tags.some((t) => t[0] === 'open');
    const parent = tag('parent') ?? null;
    // `["t","voice"]` is the Obelisk voice-channel marker. Everything else
    // defaults to `text` so existing groups keep working unchanged.
    const isVoice = ev.tags.some((t) => t[0] === 't' && t[1] === 'voice');
    const next: JsGroup = {
      id: groupId,
      name: tag('name') ?? null,
      about: tag('about') ?? null,
      picture: tag('picture') ?? null,
      banner: tag('banner') ?? null,
      isPublic,
      isOpen,
      parent,
      kind: isVoice ? 'voice' : 'text',
    };
    this.groups.update((prev) => {
      const filtered = prev.filter((g) => g.id !== groupId);
      return [...filtered, next].sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
    });
    // Start streaming messages immediately so opening the channel doesn't
    // wait on a fresh REQ round-trip — the store already has them.
    this.subscribeGroupMessages(groupId);
    // Same logic for admins/members (kinds 39001/39002): without this, the
    // sidebar's "I'm an admin of X" badge can't paint until the user opens
    // each group (because the per-group REQ only fired when ChatPanel mounted
    // and called useAdmins/useMembers). Eager subscription means admin status
    // resolves on first paint for every visible group. subscribeAdminMember
    // is idempotent — a later useAdmins call from a chat panel is a no-op.
    // TODO(bridgeCache): also write the relay's reply through cacheSet so a
    // reload paints from cache instantly.
    this.subscribeAdminMember(groupId);
    // Maintain parent → children index so the sidebar can render nesting.
    this.childrenByParent.update((prev) => {
      const next: Record<string, string[]> = { ...prev };
      // Remove this groupId from any old parent buckets to handle re-parents.
      for (const k of Object.keys(next)) {
        if (next[k].includes(groupId)) {
          next[k] = next[k].filter((id) => id !== groupId);
        }
      }
      if (parent) {
        const arr = next[parent] ?? [];
        if (!arr.includes(groupId)) next[parent] = [...arr, groupId].sort();
      }
      return next;
    });
  }

  private ingestMessage(groupId: string, ev: NostrEvent): void {
    const replyTo = ev.tags.find((t) => t[0] === 'e' && t[3] === 'reply')?.[1] ?? null;
    const msg: JsMessage = {
      id: ev.id,
      pubkey: ev.pubkey,
      content: ev.content,
      createdAt: ev.created_at,
      kind: ev.kind,
      replyToId: replyTo,
    };
    this.messagesByGroup.update((prev) => {
      const existing = prev[groupId] ?? [];
      if (existing.some((m) => m.id === msg.id)) return prev;
      const next = [...existing, msg].sort((a, b) => a.createdAt - b.createdAt);
      return { ...prev, [groupId]: next };
    });
    // Lazy metadata fetch for any author we haven't seen yet.
    this.ensureUserMetadata(ev.pubkey);
  }

  private ingestReaction(groupId: string, ev: NostrEvent): void {
    const targetEventId = ev.tags.find((t) => t[0] === 'e')?.[1];
    if (!targetEventId) return;
    const reaction: JsReaction = {
      id: ev.id,
      pubkey: ev.pubkey,
      emoji: ev.content || '+',
      targetEventId,
      createdAt: ev.created_at,
    };
    this.reactionsByGroup.update((all) => {
      const forGroup = { ...(all[groupId] ?? {}) };
      const existing = forGroup[targetEventId] ?? [];
      if (existing.some((r) => r.id === reaction.id)) return all;
      forGroup[targetEventId] = [...existing, reaction];
      return { ...all, [groupId]: forGroup };
    });
  }

  private async ingestIncomingDM(ev: NostrEvent): Promise<void> {
    if (!this.session) return;
    const me = this.session.pubKeyHex;
    const recipient = ev.tags.find((t) => t[0] === 'p')?.[1];
    const isOutgoing = ev.pubkey === me;
    const counterparty = isOutgoing ? (recipient ?? '') : ev.pubkey;
    if (!counterparty) return;
    let plaintext: string;
    try {
      plaintext = await this.decryptNip04(counterparty, ev.content);
    } catch {
      return; // can't decrypt → skip silently
    }
    this.ingestDM(ev, plaintext, isOutgoing, counterparty);
  }

  private ingestDM(ev: NostrEvent, plaintext: string, outgoing: boolean, counterparty: string): void {
    const dm: JsDirectMessage = {
      id: ev.id,
      counterparty,
      outgoing,
      content: plaintext,
      createdAt: ev.created_at,
    };
    this.dmsByPeer.update((all) => {
      const existing = all[counterparty] ?? [];
      if (existing.some((m) => m.id === dm.id)) return all;
      return {
        ...all,
        [counterparty]: [...existing, dm].sort((a, b) => a.createdAt - b.createdAt),
      };
    });
    this.ensureUserMetadata(counterparty);
  }

  private async encryptNip04(recipientPubkey: string, content: string): Promise<string> {
    if (!this.session) throw new Error('Not logged in');
    if (this.session.loginMethod === 'nsec' && this.session.privKeyHex) {
      return nip04.encrypt(this.session.privKeyHex, recipientPubkey, content);
    }
    if (this.session.loginMethod === 'nip07') {
      const w = (window as any).nostr;
      if (!w?.nip04?.encrypt) throw new Error('Extension does not support NIP-04 encryption');
      return w.nip04.encrypt(recipientPubkey, content);
    }
    if (this.session.loginMethod === 'bunker') {
      const b = await this.ensureBunkerSigner();
      return b.nip04Encrypt(recipientPubkey, content);
    }
    throw new Error('Cannot encrypt with current login method');
  }

  private async decryptNip04(senderPubkey: string, ciphertext: string): Promise<string> {
    if (!this.session) throw new Error('Not logged in');
    if (this.session.loginMethod === 'nsec' && this.session.privKeyHex) {
      return nip04.decrypt(this.session.privKeyHex, senderPubkey, ciphertext);
    }
    if (this.session.loginMethod === 'nip07') {
      const w = (window as any).nostr;
      if (!w?.nip04?.decrypt) throw new Error('Extension does not support NIP-04 decryption');
      return w.nip04.decrypt(senderPubkey, ciphertext);
    }
    if (this.session.loginMethod === 'bunker') {
      const b = await this.ensureBunkerSigner();
      return b.nip04Decrypt(senderPubkey, ciphertext);
    }
    throw new Error('Cannot decrypt with current login method');
  }

  private ingestUserMetadata(ev: NostrEvent): void {
    try {
      const data = JSON.parse(ev.content) as Record<string, unknown>;
      const meta: JsUserMetadata = {
        pubkey: ev.pubkey,
        name: (data.name as string) ?? null,
        displayName: (data.display_name as string) ?? null,
        picture: (data.picture as string) ?? null,
        about: (data.about as string) ?? null,
        nip05: (data.nip05 as string) ?? null,
        banner: (data.banner as string) ?? null,
        lud16: (data.lud16 as string) ?? null,
        website: (data.website as string) ?? null,
      };
      this.userMetadata.update((prev) => ({ ...prev, [ev.pubkey]: meta }));
    } catch {
      // ignore malformed kind:0 content
    }
  }

  /**
   * Look up a recipient's NIP-65 (kind 10002) read relays so we can publish
   * DMs to relays they actually subscribe to. Cached per-pubkey for 6h.
   * Returns an empty list on miss/timeout — caller falls back to `this.relays`.
   */
  private async fetchRecipientReadRelays(pubkey: string): Promise<string[]> {
    const TTL_MS = 6 * 3600 * 1000;
    const cached = this.recipientReadRelaysCache.get(pubkey);
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.relays;
    const searchRelays = Array.from(new Set([...this.relays, ...PROFILE_RELAYS]));
    let event: NostrEvent | null = null;
    try {
      event = await this.pool.get(searchRelays, { kinds: [10002], authors: [pubkey] }, { maxWait: 4000 });
    } catch {
      event = null;
    }
    const read = event ? parseRelayListMeta(event).read : [];
    this.recipientReadRelaysCache.set(pubkey, { relays: read, fetchedAt: Date.now() });
    return read;
  }

  /**
   * Fetch the user's own kind 10050 (NIP-17 inbox) + kind 10002 (NIP-65)
   * relay lists across a wide search net. Used after connect to extend the
   * incoming-DM subscription onto the relays where other clients (Damus,
   * Amethyst, Primal, …) actually deliver DMs addressed to us.
   */
  private async fetchMyDmRelays(): Promise<string[]> {
    if (!this.session) return [];
    const me = this.session.pubKeyHex;
    const searchRelays = Array.from(new Set([...this.relays, ...PROFILE_RELAYS]));
    const out = new Set<string>();
    try {
      const events = await this.pool.querySync(
        searchRelays,
        { kinds: [10002, 10050], authors: [me] },
        { maxWait: 4000 },
      );
      // Pick the newest of each kind.
      const newest = new Map<number, NostrEvent>();
      for (const ev of events) {
        const cur = newest.get(ev.kind);
        if (!cur || ev.created_at > cur.created_at) newest.set(ev.kind, ev);
      }
      const meta = newest.get(10002);
      if (meta) {
        const { read, write } = parseRelayListMeta(meta);
        read.forEach((u) => out.add(u));
        write.forEach((u) => out.add(u));
      }
      const inbox = newest.get(10050);
      if (inbox) parseInboxRelays(inbox).forEach((u) => out.add(u));
    } catch {
      // best-effort — fall through to whatever we have
    }
    return Array.from(out);
  }

  private async signAndPublish(template: { kind: number; content: string; tags: string[][]; created_at: number }, extraRelays: string[] = []): Promise<NostrEvent> {
    if (!this.session) throw new Error('Not logged in');

    let event: NostrEvent;
    if (this.session.loginMethod === 'nsec' && this.session.privKeyHex) {
      const sk = hexToBytes(this.session.privKeyHex);
      event = finalizeEvent(template, sk);
    } else if (this.session.loginMethod === 'nip07') {
      const win = (window as any).nostr;
      if (!win) throw new Error('NIP-07 extension unavailable');
      event = (await win.signEvent({ ...template, pubkey: this.session.pubKeyHex })) as NostrEvent;
    } else if (this.session.loginMethod === 'bunker') {
      const b = await this.ensureBunkerSigner();
      event = (await b.signEvent(template)) as NostrEvent;
    } else {
      throw new Error(`Login method ${this.session.loginMethod} cannot sign events in this build`);
    }

    const targetRelays = Array.from(new Set([...this.relays, ...extraRelays]));
    const results = await Promise.allSettled(
      this.pool.publish(targetRelays, event, { onauth: this.getAuthSigner() }),
    );
    const accepted = results.filter((r) => r.status === 'fulfilled');
    if (accepted.length === 0) {
      const reasons = results
        .map((r, i) => {
          if (r.status === 'fulfilled') return null;
          const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
          return `${targetRelays[i]}: ${reason}`;
        })
        .filter(Boolean)
        .join('; ');
      throw new Error(`Relay rejected event (kind ${event.kind}). ${reasons || 'no relay accepted'}`);
    }
    return event;
  }

  private persist(): void {
    if (typeof window === 'undefined' || !this.session) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.session));
  }
}

/**
 * Reject obviously-bogus relay URLs *before* opening a WebSocket. Browsers
 * will happily DNS-search single-label hosts (e.g. `pindonga` →
 * `pindonga.<search-domain>`) and corporate networks may serve a captive
 * page on TCP connect, so the WebSocket can occasionally appear to "open"
 * for typos. Require: ws/wss scheme + a hostname containing at least one
 * dot (or a literal IP / localhost).
 */
function validateRelayUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`"${url}" is not a valid URL`);
  }
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error(`relay URL must use ws:// or wss:// (got ${parsed.protocol})`);
  }
  const host = parsed.hostname;
  if (!host) throw new Error('relay URL has no hostname');
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':'); // v4 or v6
  const isLocalhost = host === 'localhost';
  if (!isIp && !isLocalhost && !host.includes('.')) {
    throw new Error(`"${host}" is not a valid relay hostname (single-label hosts are not allowed)`);
  }
}

function generateGroupId(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('invalid hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

// Decode an nsec1… bech32 string to (privHex, pubHex). Exported for the LoginModal.
export function decodeNsec(nsec: string): { privKeyHex: string; pubKeyHex: string } {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== 'nsec') throw new Error('Not an nsec key');
  const sk = decoded.data as Uint8Array;
  const privKeyHex = Array.from(sk).map((b) => b.toString(16).padStart(2, '0')).join('');
  const pubKeyHex = getPublicKey(sk);
  return { privKeyHex, pubKeyHex };
}

let bridgePromise: Promise<NostrBridge> | null = null;
let bridgeInstance: BridgeImpl | null = null;

export function getBridge(): Promise<NostrBridge> {
  if (!bridgePromise) {
    bridgePromise = (async () => {
      bridgeInstance = new BridgeImpl();
      await bridgeInstance.initialize();
      return bridgeInstance;
    })();
  }
  return bridgePromise;
}

export function getBridgeSync(): NostrBridge | null {
  return bridgeInstance;
}

/**
 * Same as {@link getBridgeSync}, but returns the concrete `BridgeImpl` so
 * callers can reach methods that aren't part of the WASM-mirrored
 * `NostrBridge` surface — currently `publishEvent` / `subscribeFilter` for
 * voice. Returns `null` if {@link getBridge} has not been awaited yet.
 */
export function getBridgeImpl(): BridgeImpl | null {
  return bridgeInstance;
}

export type { BridgeImpl };
