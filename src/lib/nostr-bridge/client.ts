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
 *   when the broken first-draft was reverted) and obelisk/HANDOFF.md
 *   for the WASM swap recipe.
 */
import { SimplePool, type Filter, type Event as NostrEvent, type EventTemplate, type VerifiedEvent, finalizeEvent, getPublicKey, nip19, nip04 } from 'nostr-tools';
import { BunkerSigner, parseBunkerInput, createNostrConnectURI } from 'nostr-tools/nip46';
import { generateSecretKey } from 'nostr-tools/pure';
import { v2 as nip44 } from 'nostr-tools/nip44';
import type { NipSigner } from '@/lib/nip-59';
import { parseRelayListMeta, parseInboxRelays } from '@/lib/nostr-read';
import { TextCoercingWebSocket } from '@/lib/nostr-pool';
import { cacheGet, cacheSet, cacheClearAll, cacheListIds } from './cache';
import { normalizeRelayUrl } from './relay-url';
import { runConnectFanOut, type TierAction } from './orchestrator';
import { wotEngine } from '@/lib/wot/engine';
import { useModerationStore } from '@/store/moderation';
import { resetAllClientState } from '@/lib/reset';
import { pushActivity, resolveActivity, failActivity, trackActivity, dismissActivity } from '@/lib/activity-log';
import { useReadStateStore } from '@/store/read-state';
import { isUserWatchingDM, isUserWatchingChannel } from '@/lib/read-gates';
import { extractMentionPubkeysFromMessage } from '@/lib/mentions';
import type {
  NostrBridge,
  JsGroup,
  JsForumTag,
  JsMessage,
  JsUserMetadata,
  JsReaction,
  JsDirectMessage,
  MessagesStatus,
  RelayAccessState,
  Unsubscribe,
} from './types';

/**
 * Map a CLOSED reason or publish-rejection message to a RelayAccessState.
 * Returns `null` if the reason is benign (e.g. local close) so callers leave
 * the existing state untouched. Pattern bank derives from common relay
 * implementations: strfry, nostream, nostrudel, gnost-relay.
 */
function parseRelayRejection(reason: string): RelayAccessState | null {
  const r = reason.toLowerCase();
  // Rate-limit / quota messages often ship with the "restricted:" prefix
  // (e.g. "restricted: connection rate limit exceeded", "restricted:
  // Subscription quota exceeded: 50/50", "ERROR: too many concurrent REQs").
  // They are transient — not a pubkey-allowlist signal — and classifying
  // them as 'restricted' would wrongly flash "Not whitelisted" to legitimate
  // users. Returning null here also keeps the onclose handler from setting
  // `shouldRetry`, which is what stops the sub-flood that exhausts the very
  // quota the relay was complaining about.
  if (
    r.includes('rate limit') ||
    r.includes('rate-limit') ||
    r.includes('too many') ||
    r.includes('slow down') ||
    r.includes('quota') ||
    r.includes('concurrent')
  ) {
    return null;
  }
  if (r.includes('auth-required') || r.includes('auth_required') || r.includes('auth required')) {
    return 'auth-required';
  }
  if (
    r.includes('restricted') ||
    r.includes('blocked') ||
    r.includes('not allowed') ||
    r.includes('not whitelisted') ||
    r.includes('whitelist') ||
    r.includes('forbidden')
  ) {
    return 'restricted';
  }
  return null;
}

/**
 * Options for {@link BridgeImpl.publishEvent}. `mode: 'merge'` (default)
 * publishes to the union of `this.relays` and `extraRelays`; `mode: 'replace'`
 * publishes ONLY to `extraRelays`. Used by per-relay state events that must
 * not leak to the user's other relays.
 */
export interface PublishOpts {
  readonly extraRelays?: readonly string[];
  readonly mode?: 'merge' | 'replace';
}

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
const KIND_GROUP_REMOVE_PERMISSION = 9003;
const KIND_GROUP_DELETE_EVENT = 9005;
const KIND_GROUP_ADMINS = 39001;
const KIND_GROUP_MEMBERS = 39002;
const KIND_MUTE_LIST = 10000;
/**
 * Obelisk SFU active-call announcement (kind 31314, parameterized
 * replaceable). Emitted by an SFU when a room is live, with `d=<channelId>`,
 * `host=<hostPubkey>`, `status=<active|closed>`, and `expiration=<unix>`.
 * Sidebar and channel headers subscribe to this so a "LIVE" badge appears
 * even for users who aren't currently in the call.
 */
const KIND_SFU_ACTIVE_CALL = 31314;

export const STORAGE_KEY = 'obelisk-dex/session';
export const RELAYS_KEY = 'obelisk-dex/relays';
const LEGACY_STORAGE_KEY = 'obeliskord/session';
const LEGACY_RELAYS_KEY = 'obeliskord/relays';
const DEFAULT_RELAY = 'wss://public.obelisk.ar';
const DEFAULT_RELAYS = ['wss://public.obelisk.ar'];

// Per-channel message backfill cap. Only this many of the most recent kind 9
// events are pulled into `messagesByGroup` on the live REQ; older messages
// are paged in on demand via `loadMoreMessages`. Keeps the initial fan-out
// cheap when the user belongs to many channels and trims memory growth on
// long-lived sessions. See docs/data-system.md.
const BACKGROUND_MESSAGE_LIMIT = 50;
const LOAD_MORE_PAGE_SIZE = 50;

// How long to wait before flipping the relay-access banner from 'unknown' to
// a non-ok state on retryable rejections (auth-required/restricted). The
// `subscribeWatched` retry path heals most NIP-42 AUTH races in <1s; a 4s
// soak hides the banner for those, while still surfacing genuinely persistent
// auth/whitelist problems within a few seconds.
const RELAY_ACCESS_SOAK_MS = 4000;

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
export const PROFILE_RELAYS = [
  'wss://relay.obelisk.ar',
  'wss://public.obelisk.ar',
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

  /**
   * Per-relay timers for deferred relay-access downgrades. See
   * {@link setRelayAccessDeferred}. Cleared on session change.
   */
  private deferredAccessDowngrades = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Activity-log id of the persistent "Authenticating with {host}" entry
   * tied to a relay's `'authenticating'` access state. Created when the
   * relay first sends a NIP-42 AUTH challenge (in `automaticallyAuth`),
   * resolved when access flips to `'ok'`, failed when it flips to
   * `'auth-required'` / `'restricted'` / `'error'`. Driven entirely from
   * inside {@link setRelayAccess} so any code path that mutates access state
   * keeps the bottom-right indicator in sync.
   */
  private authActivityIds = new Map<string, number>();

  /**
   * True if `url` is the relay the user is currently viewing — the only
   * relay we should answer NIP-42 AUTH challenges for. nostr-tools may pass
   * URLs with or without a trailing slash, so compare normalized.
   */
  private isActiveRelay(url: string): boolean {
    const target = normalizeRelayUrl(url);
    if (this.relays.some((r) => normalizeRelayUrl(r) === target)) return true;
    // Relays the bridge has been explicitly told to subscribe on via
    // {@link subscribeFilterWatched}'s `relays` override count as
    // "active enough" to sign NIP-42 AUTH for. The SFU RPC path needs
    // this — without it, a tab whose primary relay is public.obelisk.ar
    // can publish requests to the SFU's trusted relay (relay.obelisk.ar)
    // but never receive the responses, because the relay's AUTH
    // challenge gets declined by the auto-auth callback.
    return this.authAllowedRelays.has(target);
  }

  /**
   * Extra relays that the auto-auth NIP-42 callback should sign for —
   * populated by subscribeFilterWatched when callers pass an explicit
   * `relays` override. Lives next to `this.relays` (the user-active list)
   * but is purely additive for AUTH purposes; readers/publishers still
   * resolve relays explicitly per call.
   */
  private authAllowedRelays = new Set<string>();

  /**
   * Update the relay-access store for the active relay. No-op for any URL
   * that isn't the currently-opened relay — we only surface auth/whitelist
   * state for the relay the user is actually looking at.
   *
   * Sticky upgrade to 'ok' guards against transient AUTH refreshes (some
   * relays re-challenge mid-session): once the relay has confirmed it reads
   * us, we don't flip back to 'authenticating' for a refresh round-trip.
   *
   * Pass `{ override: true }` for explicit relay rejections — CLOSED with
   * `auth-required:` / `restricted:` reason, ensureRelay handshake failure,
   * or a socket drop. Those are authoritative about loss of access and must
   * be allowed to downgrade from 'ok'; otherwise the banner never surfaces
   * a non-whitelisted user who first saw an EOSE on an empty filter.
   */
  private setRelayAccess(url: string, state: RelayAccessState, _opts?: { override?: boolean }): void {
    if (!this.isActiveRelay(url)) return;
    const key = normalizeRelayUrl(url);
    const cur = this.relayAccess.get();
    if (cur[key] === state) return;
    // Sticky-OK: once the relay has confirmed it reads us, never downgrade
    // back to a non-'ok' state. Per-channel CLOSED rejections (private
    // channels the user isn't a member of, NIP-29 publish races) are normal
    // mid-session noise — letting them flip the banner causes flashing.
    if (cur[key] === 'ok' && state !== 'ok') return;
    // Any state transition supersedes a pending deferred downgrade — most
    // importantly, a flip to 'ok' must cancel a pending 'auth-required' so
    // the banner never appears for transient AUTH races that healed via
    // retry within the soak window.
    const pending = this.deferredAccessDowngrades.get(key);
    if (pending) {
      clearTimeout(pending);
      this.deferredAccessDowngrades.delete(key);
    }
    // Manage the persistent "Authenticating with {host}" activity entry
    // that backs the bottom-right indicator. Entering 'authenticating'
    // pushes a pending entry; leaving it resolves (→ ok) or fails
    // (→ auth-required / restricted / unreachable / error).
    if (state === 'authenticating' && cur[key] !== 'authenticating') {
      const host = (() => {
        try { return new URL(url).host; } catch { return url; }
      })();
      const id = pushActivity(`Authenticating with ${host}`, 'NIP-42 relay AUTH — approve in your signer');
      this.authActivityIds.set(key, id);
    } else if (cur[key] === 'authenticating' && state !== 'authenticating') {
      const id = this.authActivityIds.get(key);
      if (id != null) {
        if (state === 'ok') {
          resolveActivity(id);
        } else if (state === 'auth-required') {
          failActivity(id, 'AUTH was not accepted by the relay');
        } else if (state === 'restricted') {
          failActivity(id, 'pubkey is not whitelisted on this relay');
        } else if (state === 'unreachable') {
          // Transient: the socket dropped mid-AUTH. The reconnect path
          // will fire a fresh AUTH activity if it actually re-authenticates.
          // Marking this one as failed surfaces a misleading "relay is
          // unreachable" toast even when the next round-trip succeeds.
          dismissActivity(id);
        } else if (state === 'error') {
          failActivity(id, 'relay rejected the request');
        } else {
          dismissActivity(id);
        }
        this.authActivityIds.delete(key);
      }
    }
    this.relayAccess.set({ ...cur, [key]: state });
  }

  /**
   * Schedule a downgrade to a non-'ok' relay-access state after a soak
   * window. Used when CLOSED carries `auth-required` / `restricted` reasons
   * but `subscribeWatched` is about to retry: most of those rejections are
   * transient (the relay sent CLOSED before NIP-42 AUTH fully completed) and
   * heal in milliseconds. Calling `setRelayAccess` immediately would flash
   * the banner during the AUTH race.
   *
   * The deferred call bypasses sticky-OK because by the time the timer fires
   * (after RELAY_ACCESS_SOAK_MS), the relay has had multiple opportunities to
   * deliver an event/EOSE that would have cancelled the downgrade. A
   * persistent CLOSED auth-required/restricted is the relay's authoritative
   * answer, even if an earlier EOSE on a different filter said 'ok'.
   *
   * - First failure starts the timer; subsequent failures while the timer is
   *   pending do NOT reset it (we want a fixed bound on how long the banner
   *   stays hidden, not "indefinite as long as failures keep arriving").
   * - A successful read (`setRelayAccess(url, 'ok')`) cancels the pending
   *   downgrade — that's the happy path: retry succeeded, banner never shown.
   * - On session change, `resetPoolForSessionChange` clears all timers.
   */
  private setRelayAccessDeferred(url: string, state: RelayAccessState): void {
    if (!this.isActiveRelay(url)) return;
    const key = normalizeRelayUrl(url);
    const cur = this.relayAccess.get();
    if (cur[key] === 'ok') return; // sticky-OK
    if (cur[key] === state) return;
    if (this.deferredAccessDowngrades.has(key)) return; // don't extend window
    const t = setTimeout(() => {
      this.deferredAccessDowngrades.delete(key);
      const now = this.relayAccess.get();
      if (now[key] === 'ok') return;
      if (now[key] === state) return;
      this.setRelayAccess(url, state);
    }, RELAY_ACCESS_SOAK_MS);
    this.deferredAccessDowngrades.set(key, t);
  }
  private session: PersistedSession | null = null;
  private subs: Array<{ close: () => void; markClosed?: () => void }> = [];
  private activeGroupId: string | null = null;
  /** Active NIP-46 signer (when loginMethod === 'bunker'). Reconstructed lazily. */
  private bunkerSigner: BunkerSigner | null = null;
  /** Set by the modal so it can show the auth-challenge URL. */
  private bunkerOnAuth: ((url: string) => void) | null = null;

  constructor() {
    this.pool = this.createPool();
    this.wireWotEngine();
  }

  /**
   * Connect the WoT engine to the bridge:
   *   - Consensual-DM exemption: any peer we have a cached DM thread with
   *     bypasses the gate (you opted in by talking to them).
   *   - Synced mute list (NIP-51 kind 10000) + local zustand mute list →
   *     engine's union via {@link syncMutesToEngine}.
   *   - Local zustand block list → engine's hard denylist.
   *   - `verdict-deny` listener prunes any data we admitted while a verdict
   *     was still resolving so the "no untrusted state persists" invariant
   *     holds eventually.
   */
  private wireWotEngine(): void {
    this.myPubkey.subscribe((pk) => wotEngine.setOwnPubkey(pk));
    wotEngine.setConsensualDmPredicate((pubkey) => {
      const peers = this.dmsByPeer.get();
      return Object.prototype.hasOwnProperty.call(peers, pubkey);
    });
    this.myMutes.subscribe(() => this.syncMutesToEngine());
    if (typeof window !== 'undefined') {
      useModerationStore.subscribe(() => this.syncMutesToEngine());
      this.syncMutesToEngine();
    }
    wotEngine.on('verdict-deny', (pubkey) => this.pruneAuthor(pubkey));
    wotEngine.onEnabledChanged((enabled) => {
      if (enabled) this.reevaluateKnownAuthors();
    });
  }

  /**
   * Walk every author currently present in the stores and enqueue them for
   * a fresh WoT verdict. Deny verdicts fire `verdict-deny` → pruneAuthor()
   * wipes their entries, so toggling WoT on retroactively cleans up data
   * that came in fail-open while the engine was disabled. No-op when WoT
   * is off (`markUnknown` short-circuits).
   */
  private reevaluateKnownAuthors(): void {
    const authors = new Set<string>();
    for (const msgs of Object.values(this.messagesByGroup.get())) {
      for (const m of msgs) authors.add(m.pubkey);
    }
    for (const peer of Object.keys(this.dmsByPeer.get())) authors.add(peer);
    for (const pk of Object.keys(this.userMetadata.get())) authors.add(pk);
    for (const list of Object.values(this.adminsByGroup.get())) for (const pk of list) authors.add(pk);
    for (const list of Object.values(this.membersByGroup.get())) for (const pk of list) authors.add(pk);
    if (this.session) authors.delete(this.session.pubKeyHex);
    for (const pk of authors) wotEngine.markUnknown(pk);
  }

  private syncMutesToEngine(): void {
    const local = (typeof window !== 'undefined') ? useModerationStore.getState() : null;
    const synced = this.myMutes.get();
    const muteUnion = new Set<string>([...(synced ?? []), ...(local?.mutedPubkeys ?? [])]);
    wotEngine.setMutedPubkeys(Array.from(muteUnion));
    wotEngine.setBlockedPubkeys(local?.blockedPubkeys ?? []);
  }

  /**
   * Wipe in-memory + cache entries authored by `pubkey`. Called when the WoT
   * engine resolves a deny verdict (or when the user just muted/blocked the
   * author) — ensures untrusted state doesn't linger after the verdict
   * arrives, even if it slipped through fail-open earlier.
   */
  private pruneAuthor(pubkey: string): void {
    this.messagesByGroup.update((prev) => {
      let touched = false;
      const next: Record<string, JsMessage[]> = {};
      for (const [gid, msgs] of Object.entries(prev)) {
        const filtered = msgs.filter((m) => m.pubkey !== pubkey);
        if (filtered.length !== msgs.length) touched = true;
        next[gid] = filtered;
      }
      return touched ? next : prev;
    });
    this.dmsByPeer.update((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, pubkey)) return prev;
      const { [pubkey]: _drop, ...rest } = prev;
      void _drop;
      return rest;
    });
    this.userMetadata.update((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, pubkey)) return prev;
      const { [pubkey]: _drop, ...rest } = prev;
      void _drop;
      return rest;
    });
    this.userMetadataLatestAt.delete(pubkey);
    this.metadataRequested.delete(pubkey);
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
      automaticallyAuth: (relayUrl: string) => {
        if (!this.session) return null;
        // Only sign NIP-42 AUTH challenges for the relay the user has
        // currently opened. Auxiliary relays (profile lookup, NostrConnect
        // rendezvous, NIP-65 DM relays) may issue AUTH too, but we don't
        // want to leak the user's pubkey to relays they're not browsing —
        // and a slow/unresponsive auxiliary signer should not block reads.
        if (!this.isActiveRelay(relayUrl)) return null;
        // Flip the relay into 'authenticating' synchronously so the UI can
        // gate cached groups/messages on a positive AUTH signal before any
        // signer round-trip. The activity-log entry tied to this state
        // (managed by setRelayAccess) keeps the bottom-right indicator
        // visible until the relay accepts/rejects us.
        this.setRelayAccess(relayUrl, 'authenticating');
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

  /**
   * `true` when the active relay's WebSocket is currently in OPEN state.
   * Set in `connect()` after `ensureRelay` reports `connected`, cleared in
   * the `relay.onclose` handler. Used to short-circuit `pool.close()` and
   * per-sub `activeSub.close()` calls when the socket has already dropped —
   * sending a CLOSE frame on a non-OPEN WebSocket is a noisy browser
   * warning ("WebSocket is already in CLOSING or CLOSED state") logged
   * once per sub and once per pool.close, which spams the console during
   * a normal reconnect cycle.
   */
  private poolSocketAlive = false;
  // Reactive state
  isLoggedIn = new StateStore(false);
  /**
   * Per-relay access state (NIP-42 / whitelist) for the active relay only.
   * Keyed by `normalizeRelayUrl(url)`. Updated from CLOSED reasons in
   * `subscribeWatched` and from rejected publishes in `signAndPublish`.
   * Reset on `switchRelay` / `resetPoolForSessionChange`.
   */
  relayAccess = new StateStore<Record<string, RelayAccessState>>({});
  connectionState = new StateStore<string>('Disconnected');
  currentRelayUrl = new StateStore<string>(DEFAULT_RELAY);
  configuredRelays = new StateStore<string[]>([...DEFAULT_RELAYS]);
  groups = new StateStore<JsGroup[]>([]);
  /**
   * `true` once the relay has emitted EOSE for the global kind 39000 sub on
   * the active relay. Lets the empty-state UI distinguish "still loading"
   * from "relay confirmed zero groups visible to me" — the latter is the
   * classic whitelist symptom on relays that don't send a CLOSED reason.
   */
  groupMetadataEose = new StateStore<boolean>(false);
  messagesByGroup = new StateStore<Record<string, JsMessage[]>>({});
  userMetadata = new StateStore<Record<string, JsUserMetadata>>({});
  reactionsByGroup = new StateStore<Record<string, Record<string, JsReaction[]>>>({});
  childrenByParent = new StateStore<Record<string, string[]>>({});
  dmsByPeer = new StateStore<Record<string, JsDirectMessage[]>>({});
  /**
   * Original send arguments for in-flight or just-failed group-message
   * publishes, keyed by `clientTag`. Survives the publish itself so a retry
   * can replay the exact same content / replyTo / created_at — replaying
   * with a fresh `created_at` would let two NIP-29 events with different ids
   * both reach the relay, leaving a duplicate behind.
   */
  private pendingGroupSends = new Map<string, {
    groupId: string;
    content: string;
    replyTo: { id: string; pubkey: string } | null;
    createdAt: number;
  }>();
  /** Same as {@link pendingGroupSends} for NIP-04 DMs. */
  private pendingDMSends = new Map<string, {
    recipientPubkey: string;
    content: string;
    createdAt: number;
  }>();
  adminsByGroup = new StateStore<Record<string, string[]>>({});
  membersByGroup = new StateStore<Record<string, string[]>>({});
  /**
   * Map of `groupId -> creator pubkey hex`, derived from the kind 9007 event
   * that created each group. Used by {@link claimCreatorAdmin} to know whether
   * the local user is the creator of a group (so we should publish a kind 9000
   * with `['admin']` if the relay didn't auto-promote them) without spamming
   * kind 9000 publishes for every group on every login.
   */
  groupCreators = new StateStore<Record<string, string>>({});
  /**
   * Per-group flag flipped to `true` once the relay has delivered at least
   * one kind 39001 (admins) or 39002 (members) event for that group. The
   * voice-channel membership gate uses this as positive evidence the relay
   * is actually responding before deciding "not-a-member" — without it, a
   * slow NIP-42 round-trip looks identical to "user is not a member" and
   * users have to refresh to recover.
   */
  membershipReadyByGroup = new StateStore<Record<string, boolean>>({});
  /**
   * Per-group flag flipped to `true` once the relay has emitted EOSE for
   * the kind 9 messages REQ scoped to that group. Lets the message pane
   * tell "still loading" apart from "relay confirmed empty" — the latter
   * is what justifies the welcome / empty-state copy. Reset on relay
   * switch / logout (the new relay hasn't responded yet).
   *
   * Prefer {@link messagesStatusByGroup} for new UI code: EOSE alone is
   * not proof of emptiness on auth-gated / silent-filtering relays. The
   * status field carries the bridge's retry-backed confidence.
   */
  messagesEoseByGroup = new StateStore<Record<string, boolean>>({});
  /**
   * Per-group confidence enum for the kind 9 messages stream. See
   * {@link MessagesStatus} for transitions. The chat pane reads this to
   * decide between "Loading messages…" (loading | empty-unconfirmed) and
   * "No messages yet" (empty-confirmed). Empty-unconfirmed exists because
   * auth-gated relays routinely send EOSE-empty fast and trickle real
   * events afterwards; the bridge stays in that state through up to
   * {@link EMPTY_RETRY_DELAYS}.length restarts before promoting to
   * empty-confirmed, so the UI never falsely flashes "No messages".
   */
  messagesStatusByGroup = new StateStore<Record<string, MessagesStatus>>({});
  /**
   * SFU active-call state per channel id. Populated from kind 31314 events
   * the SFU publishes when a room is live. The UI reads this to show a
   * "LIVE" indicator on voice channels in the sidebar — even for users
   * who aren't currently joined. `null` (or missing entry) means no active
   * call known. Entries auto-expire client-side once `expiresAt` passes
   * so a stale advertisement doesn't pin "LIVE" forever after an SFU
   * crash that never published `status=closed`.
   */
  activeCallByChannel = new StateStore<Record<string, { hostPubkey: string; status: string; participantCount: number; expiresAt: number; createdAt: number }>>({});
  myFollows = new StateStore<string[]>([]);
  /**
   * NIP-51 kind 10000 mute list — pubkeys the local user has muted (public
   * `p` tags only; encrypted entries in `content` are not yet decrypted).
   * Consumers filter messages and DMs against this set so muted authors'
   * content disappears from the UI without affecting relay storage.
   */
  myMutes = new StateStore<string[]>([]);
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
  /**
   * Per-group kind 9 subscription handles. Tracked so
   * {@link refreshGroupMessages} can close the previous sub before opening
   * a fresh one — without this the bridge would leak stale subs every time
   * a chat panel re-mounts a stale channel.
   */
  private messageSubByGroup = new Map<string, { close: () => void; markClosed?: () => void }>();
  // Group ids we already have a reaction subscription for.
  private reactionSubscribedGroups = new Set<string>();
  private dmSubscribed = false;
  private adminMemberSubscribedGroups = new Set<string>();
  private creatorSubscribedGroups = new Set<string>();
  // Newest `created_at` we've seen for kind-39001 (admins) / kind-39002
  // (members) per group id. Used to drop out-of-order ingests so an older
  // revision arriving second from a slower relay can't clobber the newer
  // list — the symptom of that race is the admin badge / settings gear /
  // members rail flickering on/off until the user refreshes.
  private adminMemberLatestAt = new Map<string, number>();
  // Same newest-wins guard for kind 39000 (group metadata) so an older
  // revision from a slow relay can't overwrite a fresher one. Also lets
  // the cached seed survive against stale events still in flight.
  private groupMetadataLatestAt = new Map<string, number>();
  // Newest-wins guard for kind 0 (user metadata). Without this, an older
  // revision returned by a slow profile relay overwrites a newer one from a
  // faster relay — the symptom is the member rail's names/avatars loading
  // and then "unloading" back to the npub a moment later.
  private userMetadataLatestAt = new Map<string, number>();
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
  /**
   * Background queue for kind 9 message subscriptions discovered via
   * `ingestGroupMetadata`. The relay typically streams hundreds of kind
   * 39000 events back-to-back at login; firing N message REQs in the same
   * tick floods the relay's per-connection sub limit and the channel the
   * user is actually looking at ends up at the back of the response queue.
   * Instead, we queue background subs here and process them in small
   * batches — the active group is always fast-tracked via
   * {@link setActiveGroup} or {@link bumpGroupMessagesPriority} so the
   * channel currently in view gets its history first.
   *
   * Maintained as both an ordered array (for FIFO drain) and a Set (for
   * O(1) dedup). Cleared on relay switch / logout alongside
   * `messageSubscribedGroups` so old work doesn't leak into a new pool.
   */
  private pendingMessageQueue: string[] = [];
  private pendingMessageSet = new Set<string>();
  private pendingMessageTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Per-group retry tracking for the kind 9 stream. Populated on the first
   * empty EOSE; cleared on first event ingest, channel logout, or after
   * {@link EMPTY_RETRY_DELAYS}.length restarts (whichever comes first).
   *
   * `attempts` counts the number of retries already executed (0 = just got
   * first EOSE-empty, no retry yet). `sawEvent` is currently informational
   * — the authoritative event check happens against `messagesByGroup` on
   * retry-fire so we don't race the StateStore.
   */
  private messagesRetryByGroup = new Map<string, {
    attempts: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>();
  /**
   * Backoff schedule for empty-EOSE retries. Tuned so the worst-case time
   * before declaring a channel empty is the sum of all delays plus the
   * relay's own response time (≈9.5s + EOSE latency). Auth-gated relays
   * that send EOSE-empty before AUTH completes typically deliver real
   * events within the first 1500ms; the longer tail covers slow relays
   * and transient network hiccups.
   */
  private static readonly EMPTY_RETRY_DELAYS = [1500, 3000, 5000] as const;
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
            const merged = uniqueRelayUrls(list);
            let mutated = merged.length !== list.length || merged.some((url, i) => url !== list[i]);
            for (const def of DEFAULT_RELAYS) {
              const normalizedDefault = normalizeRelayUrl(def);
              if (!merged.includes(normalizedDefault)) {
                merged.push(normalizedDefault);
                mutated = true;
              }
            }
            this.configuredRelays.set(merged);
            if (mutated) {
              window.localStorage.setItem(RELAYS_KEY, JSON.stringify(merged));
            }
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
      parsed.relayUrl = normalizeRelayUrl(parsed.relayUrl);
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
      // and docs/data-system.md.
      try {
        await this.connect();
      } catch {
        // First connect attempt failed (relay unreachable, AUTH timeout,
        // etc.). Keep the session in memory and silently retry in the
        // background with capped exponential backoff so the user doesn't
        // have to refresh. The cached sidebar paint from seedCacheForRelay
        // is already on screen (admins/members/groups), so the UI doesn't
        // flash empty — we just keep trying until a relay answers.
        this.myPubkey.set(parsed.pubKeyHex);
        this.myLoginMethod.set(parsed.loginMethod);
        this.isLoggedIn.set(true);
        void this.reconnectInBackground();
        return;
      }
      this.myPubkey.set(parsed.pubKeyHex);
      this.myLoginMethod.set(parsed.loginMethod);
      this.isLoggedIn.set(true);
    } catch {
      // Corrupt storage: drop both the current and legacy session entries so
      // `useIsRehydrating` doesn't latch true forever on the next paint
      // (the LoginModal would never appear and the user would be locked out
      // looking at a permanent "Reconnecting…" screen).
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(STORAGE_KEY);
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
  }

  private ensureRelayInList(url: string): void {
    const normalized = normalizeRelayUrl(url);
    const list = this.configuredRelays.get();
    if (list.includes(normalized)) return;
    const next = uniqueRelayUrls([...list, normalized]);
    this.configuredRelays.set(next);
    this.persistRelays();
  }

  private persistRelays(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(RELAYS_KEY, JSON.stringify(this.configuredRelays.get()));
  }

  dispose(): void {
    // pool.close() handles the network teardown atomically; calling each
    // sub's close beforehand is redundant and races with the pool's own
    // closeAllSubscriptions sweep, producing CLOSING/CLOSED warnings.
    this.subs.forEach((s) => (s.markClosed ?? s.close)());
    this.subs = [];
    if (this.poolSocketAlive) {
      try { this.pool.close(this.relays); } catch { /* ignore */ }
    }
    this.poolSocketAlive = false;
    // Clear auto-auth allow-list so the next session doesn't sign AUTH
    // for relays the previous user happened to subscribe to.
    this.authAllowedRelays.clear();
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
    // Group metadata first so the sidebar lights up with channel rows even
    // before the per-group admin/member seeds populate badges.
    for (const groupId of cacheListIds(relay, KIND_GROUP_METADATA)) {
      const entry = cacheGet<{ group: JsGroup; createdAt: number }>(
        relay,
        KIND_GROUP_METADATA,
        groupId,
      );
      if (!entry) continue;
      const { group: cached, createdAt } = entry.value;
      // Backfill fields added after the cache was written so older entries
      // don't surface as `undefined` to consumers expecting an array.
      const group: JsGroup = {
        ...cached,
        forumTags: cached.forumTags ?? [],
        topics: cached.topics ?? [],
      };
      this.groupMetadataLatestAt.set(groupId, createdAt);
      this.groups.update((prev) => {
        if (prev.some((g) => g.id === groupId)) return prev;
        return [...prev, group].sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
      });
      if (group.parent) {
        this.childrenByParent.update((prev) => {
          const arr = prev[group.parent!] ?? [];
          if (arr.includes(groupId)) return prev;
          return { ...prev, [group.parent!]: [...arr, groupId].sort() };
        });
      }
    }
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
    for (const groupId of cacheListIds(relay, KIND_GROUP_CREATE)) {
      const entry = cacheGet<string>(relay, KIND_GROUP_CREATE, groupId);
      if (entry) {
        this.groupCreators.update((prev) => ({ ...prev, [groupId]: entry.value }));
      }
    }
    // Kind 0 — bounded iteration so a large cache (popular relay, many DM
    // contacts) doesn't block first paint. 500 pubkeys is well past any
    // realistic working set; the live REQs overwrite anything we skip.
    const userMetaIds = cacheListIds(relay, KIND_USER_METADATA);
    const SEED_CAP = 500;
    const seedTargets = userMetaIds.length > SEED_CAP ? userMetaIds.slice(0, SEED_CAP) : userMetaIds;
    for (const pubkey of seedTargets) {
      const entry = cacheGet<{ meta: JsUserMetadata; createdAt: number }>(
        relay,
        KIND_USER_METADATA,
        pubkey,
      );
      if (!entry) continue;
      const { meta, createdAt } = entry.value;
      if ((this.userMetadataLatestAt.get(pubkey) ?? 0) >= createdAt) continue;
      this.userMetadata.update((prev) => ({ ...prev, [pubkey]: meta }));
      this.userMetadataLatestAt.set(pubkey, createdAt);
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
   * `docs/data-system.md`.
   */
  private async finalizeLogin(): Promise<void> {
    this.persist();
    this.resetPoolForSessionChange();
    // Pin `this.relays` to the session's relay before connect(). Without this,
    // any drift between `currentRelayUrl` (what the UI shows as active) and
    // `this.relays` (what subs subscribe against) would silently put kind
    // 39000 on the wrong relay — symptom is "I logged in, the rail shows
    // public.obelisk.ar selected, but no channels arrive until I switch and
    // come back" because switchRelay is the only path that hard-resets
    // `this.relays = [url]`.
    const sessionRelay = this.currentRelayUrl.get();
    this.relays = [sessionRelay];
    // Paint cached groups/admins/members for `sessionRelay` instantly. On a
    // first login (cache empty after cacheClearAll on the prior logout, or
    // on a fresh device) this is a no-op and the live REQ fills the sidebar.
    // On re-login within the same browser session it gives the same instant
    // first paint that switchRelay does, so "fresh login" and "switch to
    // this relay" produce identical UX.
    this.seedCacheForRelay(sessionRelay);
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
    // markClosed: stop each subscribeWatched closure's watchdog/retry loop
    // without sending per-sub CLOSE frames on the old pool's sockets.
    this.subs.forEach((s) => (s.markClosed ?? s.close)());
    this.subs = [];
    // Don't call pool.close() — its internal closeAllSubscriptions sweep
    // sends a CLOSE frame per subscription, and the relay-side socket
    // routinely transitions to CLOSING between our last message and this
    // teardown (idle timeout, quota disconnect, network blip). Each
    // attempted send on a non-OPEN socket triggers
    // "WebSocket is already in CLOSING or CLOSED state" — one warning per
    // sub, which on a 50-sub session floods the console. We let the old
    // pool's WebSockets drop via server-side idle timeout or browser GC;
    // the new pool replacement is what actually carries traffic forward.
    this.poolSocketAlive = false;
    this.pool = this.createPool();
    this.messageSubscribedGroups.clear();
    this.reactionSubscribedGroups.clear();
    this.adminMemberSubscribedGroups.clear();
    this.adminMemberLatestAt.clear();
    this.metadataRequested.clear();
    // The new pool's per-group REQs haven't been issued yet — drop any
    // EOSE bits captured from the old pool so the chat pane shows its
    // loading spinner until the resub completes (see `pendingResubscribe`
    // handling in `connect()`).
    this.messagesEoseByGroup.set({});
    this.messagesStatusByGroup.set({});
    this.clearAllMessagesRetry();
    // Drop the background queue: it's tied to the dead pool's filters
    // and the new pool will receive a fresh kind 39000 fan-out which
    // will repopulate it.
    this.pendingMessageQueue = [];
    this.pendingMessageSet.clear();
    if (this.pendingMessageTimer) {
      clearTimeout(this.pendingMessageTimer);
      this.pendingMessageTimer = null;
    }
    // Re-login on the same browser keeps the in-memory bridge instance, so
    // the kind 39000 newest-wins guard retains every `groupId → created_at`
    // pair from the previous session. Kind 39000 is replaceable: the new
    // session's REQ delivers the SAME events with the SAME created_at the
    // guard just memorized, and `if (ev.created_at <= prevAt) return;` drops
    // every one of them — the sidebar stays empty until the user toggles
    // relays (switchRelay clears the Map) or refreshes (fresh bridge
    // instance). Same reason `creatorSubscribedGroups` must reset: its
    // entries are tied to the dead pool's per-group kind 9007 subs, so the
    // guard short-circuits `subscribeGroupCreator` and the new pool never
    // re-opens them.
    this.groupMetadataLatestAt.clear();
    this.creatorSubscribedGroups.clear();
    // Clear the per-group readiness flags too — the new pool has not seen
    // 39001/39002 yet, so consumers must wait for fresh evidence before
    // deciding "not a member".
    this.membershipReadyByGroup.set({});
    // Reset the kind 39000 EOSE flag so the empty-state UI shows
    // "Channels loading…" while the new pool's REQ is in flight, not the
    // stale "No channels found" / "Whitelisting required" text computed off
    // a previous session's EOSE. switchRelay already does this; without it
    // here, fresh login or background reconnect could paint the wrong
    // empty-state copy in the gap before the new EOSE arrives.
    this.groupMetadataEose.set(false);
    this.dmSubscribed = false;
    // Forget any auth/whitelist signal we'd captured against the previous
    // pool — the next REQ on the fresh sockets must re-prove access.
    this.relayAccess.set({});
    // Drop any pending deferred banner downgrades from the old pool — the
    // new socket starts at 'unknown' and must earn its own state.
    for (const t of this.deferredAccessDowngrades.values()) clearTimeout(t);
    this.deferredAccessDowngrades.clear();
    // Stale "Authenticating with {host}" entries from the old pool are no
    // longer load-bearing — the new pool will push its own entries on first
    // AUTH challenge. Dismiss rather than fail so we don't flash an error
    // toast on legitimate reconnects.
    for (const id of this.authActivityIds.values()) dismissActivity(id);
    this.authActivityIds.clear();
  }

  /**
   * NIP-46 login from a `bunker://` URL.
   * The local client secret is generated fresh per login and persisted in
   * localStorage so the signer can be rehydrated on page reload.
   */
  async loginWithBunker(
    bunkerUrl: string,
    options?: { onAuthUrl?: (url: string) => void; clientSecretHex?: string },
  ): Promise<string> {
    const bp = await parseBunkerInput(bunkerUrl);
    if (!bp) throw new Error('Invalid bunker URL');
    // When a host pre-paired the remote signer (e.g. the @nostr-wot/ui
    // QR / paste flow), it must hand us the SAME client secret it paired
    // with — otherwise the bunker rejects our connect request because
    // this client pubkey was never authorized. Falling back to a fresh
    // key is correct when we *are* the pairing party.
    const localSecret = options?.clientSecretHex
      ? hexToBytes(options.clientSecretHex)
      : generateSecretKey();
    this.bunkerOnAuth = options?.onAuthUrl ?? null;
    const signer = BunkerSigner.fromBunker(localSecret, bp, {
      onauth: (url) => {
        if (this.bunkerOnAuth) this.bunkerOnAuth(url);
        else if (typeof window !== 'undefined') window.open(url, '_blank', 'width=600,height=700');
      },
    });
    const connectId = pushActivity('Connecting to bunker', 'waiting for remote signer');
    try {
      await signer.connect();
    } catch (e) {
      failActivity(connectId, e instanceof Error ? e.message : String(e));
      throw e;
    }
    resolveActivity(connectId);
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
    const scanId = pushActivity('Waiting for QR scan', 'open your Nostr signer to approve');
    const waitForConnection = async (): Promise<string> => {
      this.bunkerOnAuth = options?.onAuthUrl ?? null;
      let signer;
      try {
        signer = await BunkerSigner.fromURI(localSecret, uri, {
          onauth: (url) => {
            if (this.bunkerOnAuth) this.bunkerOnAuth(url);
          },
        }, 60000);
      } catch (e) {
        failActivity(scanId, e instanceof Error ? e.message : String(e));
        throw e;
      }
      resolveActivity(scanId, 'signer connected');
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
      cancel: () => { cancelled = true; failActivity(scanId, 'cancelled'); },
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
    this.groupMetadataEose.set(false);
    this.messagesByGroup.set({});
    this.pendingGroupSends.clear();
    this.pendingDMSends.clear();
    this.adminsByGroup.set({});
    this.membersByGroup.set({});
    this.membershipReadyByGroup.set({});
    this.messagesEoseByGroup.set({});
    this.messagesStatusByGroup.set({});
    this.clearAllMessagesRetry();
    // Drop the background message-subscription queue too — pending work
    // is scoped to the previous session's authored REQs.
    this.pendingMessageQueue = [];
    this.pendingMessageSet.clear();
    if (this.pendingMessageTimer) {
      clearTimeout(this.pendingMessageTimer);
      this.pendingMessageTimer = null;
    }
    this.activeGroupId = null;
    // Forget any in-flight relay-access state and tear down dangling
    // "Authenticating with {host}" entries — the next session must
    // re-prove access from scratch.
    this.relayAccess.set({});
    for (const t of this.deferredAccessDowngrades.values()) clearTimeout(t);
    this.deferredAccessDowngrades.clear();
    for (const id of this.authActivityIds.values()) dismissActivity(id);
    this.authActivityIds.clear();
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
    const activityId = pushActivity(
      'Connecting to relays',
      this.relays.length === 1 ? this.relays[0] : `${this.relays.length} relays`,
    );
    try {
      // SimplePool.subscribe is lazy and synchronous — it doesn't wait for
      // the WebSocket handshake, so previously every relay (even bogus
      // ones) appeared "Connected" instantly. ensureRelay actually awaits
      // the handshake and rejects on timeout / refused / DNS failure.
      //
      // First-response wins: resolve as soon as ONE relay handshakes so
      // the rehydrate gate flips to "logged in" quickly. Slower relays
      // continue handshaking in the background; their subscriptions queue
      // on the pool and fire as each socket comes online. If every relay
      // rejects, we throw and `initialize()` falls through to background
      // reconnect with capped backoff.
      //
      // Per-relay `connectionTimeout` is intentionally tighter than the
      // 5000 ms used previously — a single slow relay used to stall the
      // entire login by holding `Promise.allSettled` open. With first-
      // response-wins this is bounded by `HARD_CEILING_MS` below, but a
      // tighter per-relay cap also gets stragglers marked `unreachable`
      // sooner so the relay banner reflects reality.
      const PER_RELAY_TIMEOUT_MS = 3000;
      const HARD_CEILING_MS = 1500;
      const handles = this.relays.map((url) =>
        (async () => {
          validateRelayUrl(url);
          const relay = await this.pool.ensureRelay(url, { connectionTimeout: PER_RELAY_TIMEOUT_MS });
          if (!relay.connected) throw new Error(`relay ${url} did not complete handshake`);
          // Mark the pool's socket alive so subsequent close() calls
          // attempt the network CLOSE; cleared in the onclose handler.
          this.poolSocketAlive = true;
          // Flip status back if the socket drops later, and trigger a
          // silent background reconnect so the user doesn't have to
          // refresh when the relay or network blips.
          relay.onclose = () => {
            this.poolSocketAlive = false;
            if (this.relays.includes(url) && this.session) {
              this.connectionState.set('Disconnected');
              // Don't override sticky-OK on transient drops — a brief socket
              // bounce shouldn't flash "Cannot reach". connectionState
              // already surfaces the reconnect attempt.
              this.setRelayAccess(url, 'unreachable');
              this.reconnectInBackground();
            }
          };
          return url;
        })(),
      );
      // Mark each relay `unreachable` as its handshake fails, in the
      // background. Doesn't await — banner updates as we get news; UI
      // proceeds at the first success or hard ceiling, whichever fires
      // first.
      handles.forEach((p, i) => {
        p.catch(() => this.setRelayAccess(this.relays[i], 'unreachable'));
      });
      // Race: first relay ready vs hard ceiling vs all relays rejected.
      // - 'first-ready' → at least one socket is open; subscriptions go
      //   live now, slow relays keep handshaking in the background.
      // - 'ceiling' → no relay has handshaken in HARD_CEILING_MS; flip the
      //   gate anyway so the user isn't stuck on "Reconnecting…". Pending
      //   handshakes continue and their subs queue on the pool.
      // - 'all-rejected' → every handshake failed; throw so initialize()
      //   falls through to capped background reconnect.
      const firstReady: Promise<'first-ready' | 'all-rejected'> = Promise.any(handles)
        .then(() => 'first-ready' as const)
        .catch(() => 'all-rejected' as const);
      const ceiling: Promise<'ceiling'> = new Promise((res) => setTimeout(() => res('ceiling'), HARD_CEILING_MS));
      const winner = await Promise.race([firstReady, ceiling]);
      if (winner === 'all-rejected') {
        throw new Error('no relays connected');
      }
      // For the 'ceiling' branch, ALSO check the eventual outcome of
      // `firstReady` in the background — if every relay later rejects,
      // the relay banner is updated by the per-handle `.catch` above and
      // `reconnectInBackground` kicks in via the next session/relay
      // change. Subscriptions registered below queue against the pool
      // and bind as relays come online.
      // Reopen any per-group REQs that were live on the previous pool.
      // Components that mounted pre-login (or pre-relay-switch) still have
      // their store listeners wired up; without this re-issue the new pool
      // has no subscriptions feeding them and the data only appears after
      // a manual refresh. The orchestrator delegates the actual re-apply
      // to {@link applyPendingResubscribe} once its P2 microtask runs.
      const pending = this.pendingResubscribe;
      this.pendingResubscribe = null;
      runConnectFanOut({
        dispatch: (action) => this.dispatchOrchestratorAction(action),
        applyResubscribe: () => this.applyPendingResubscribe(pending),
      });
      this.connectionState.set('Connected');
      this.reconnectAttempt = 0;
      // Activity message reflects the snapshot at the moment the gate
      // flipped, not the final count — slower relays may still be
      // handshaking. Approximate by resolving "1+/N" rather than tracking
      // the exact count, which would require awaiting all handles.
      resolveActivity(activityId, `connected to ${this.relays.length === 1 ? this.relays[0] : `${this.relays.length} relays`}`);
    } catch (e: unknown) {
      this.connectionState.set(`Error:${(e as Error).message}`);
      failActivity(activityId, (e as Error).message);
      throw e;
    }
  }

  /**
   * Retry `connect()` silently in the background with capped exponential
   * backoff. Used when the initial rehydrate connect fails or a relay socket
   * drops after login — we keep the chat UI mounted (with cached state from
   * seedCacheForRelay) and heal the connection without forcing the user to
   * refresh. Idempotent: a second call while one is already pending is a
   * no-op.
   */
  private reconnectAttempt = 0;
  private reconnectInFlight = false;
  private reconnectInBackground(): void {
    if (this.reconnectInFlight) return;
    if (!this.session) return;
    this.reconnectInFlight = true;
    const tick = async () => {
      if (!this.session) {
        this.reconnectInFlight = false;
        return;
      }
      this.reconnectAttempt++;
      try {
        // Fresh sockets so a half-open / AUTH-stuck socket doesn't keep
        // the new attempt from making progress.
        this.resetPoolForSessionChange();
        await this.connect();
        this.reconnectInFlight = false;
        this.reconnectAttempt = 0;
      } catch {
        const delay = Math.min(1000 * 2 ** (this.reconnectAttempt - 1), 30_000);
        setTimeout(tick, delay);
      }
    };
    void tick();
  }

  async switchRelay(url: string): Promise<void> {
    const normalized = normalizeRelayUrl(url);
    validateRelayUrl(normalized);
    // Same teardown semantics as resetPoolForSessionChange: skip the
    // pool.close() sweep to avoid CLOSING/CLOSED spam, just stop each
    // watched-sub's retry loop and replace the pool reference.
    this.subs.forEach((s) => (s.markClosed ?? s.close)());
    this.subs = [];
    this.poolSocketAlive = false;
    this.pool = this.createPool();
    this.relays = [normalized];
    this.currentRelayUrl.set(normalized);
    this.ensureRelayInList(normalized);
    if (this.session) this.session.relayUrl = normalized;
    this.persist();
    this.groups.set([]);
    this.messagesByGroup.set({});
    this.pendingGroupSends.clear();
    // `dmsByPeer` is not reset on a relay switch (DMs follow the user across
    // relays via NIP-65), so `pendingDMSends` is left intact too — a DM in
    // flight when the user pivots to a new relay can still finish there.
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
    // Same reset as logout: the new relay hasn't delivered EOSE for any
    // per-group kind 9 REQ yet, so the message pane should show its
    // loading spinner rather than the cached "ok, empty" state.
    this.messagesEoseByGroup.set({});
    this.messagesStatusByGroup.set({});
    this.clearAllMessagesRetry();
    // Drop background queue — pending entries point at filters bound to
    // the old pool. The new relay's kind 39000 fan-out will repopulate.
    this.pendingMessageQueue = [];
    this.pendingMessageSet.clear();
    if (this.pendingMessageTimer) {
      clearTimeout(this.pendingMessageTimer);
      this.pendingMessageTimer = null;
    }
    // Per-relay state that previously bled across switches: parent→children
    // index, group-creator map, reactions, the newest-wins guard cursor for
    // group metadata, and the per-group creator-sub set. Without clearing
    // these, switching from relay A → B kept A's category nesting visible,
    // dropped legitimate B-side metadata events whose `created_at` happened
    // to be older than A's (the same NIP-29 `d`-tag can exist on two relays
    // independently), and left A's reactions painted on B's messages. The
    // user-visible symptom was channels and structure from different relays
    // appearing mixed. See docs/data-system.md.
    this.childrenByParent.set({});
    this.groupCreators.set({});
    this.reactionsByGroup.set({});
    this.groupMetadataLatestAt.clear();
    this.creatorSubscribedGroups.clear();
    this.groupMetadataEose.set(false);
    this.dmSubscribed = false;
    // Auth/whitelist state is per-relay; the new one hasn't been probed yet.
    this.relayAccess.set({});
    // Drop any pending downgrade timers + auth-activity entries scoped to
    // the previous relay so a stale "Authenticating with old-host" toast
    // doesn't linger after the user has already moved on.
    for (const t of this.deferredAccessDowngrades.values()) clearTimeout(t);
    this.deferredAccessDowngrades.clear();
    for (const id of this.authActivityIds.values()) dismissActivity(id);
    this.authActivityIds.clear();
    // Re-paint instantly from disk for the new relay; live events will
    // overwrite as they arrive. See {@link seedCacheForRelay}.
    this.seedCacheForRelay(normalized);
    await this.connect();
  }

  async addRelay(url: string): Promise<void> {
    const trimmed = normalizeRelayUrl(url);
    if (!trimmed) return;
    validateRelayUrl(trimmed);
    // Register in the rail only — do NOT push into `this.relays` (the active
    // subscription set). NIP-29 channels are per-relay, so subscribing to
    // multiple relays simultaneously mixes channels from different servers
    // into the same `this.groups` store and the "Uncategorized" bucket.
    // `switchRelay(url)` is the single path that activates a relay; the rail
    // tile click-handler calls it explicitly. Without this scoping, a
    // background reconnect (`reconnectInBackground` → `connect()`) would
    // subscribe kind 39000 against every relay the user had ever added.
    this.ensureRelayInList(trimmed);
  }

  async removeRelay(url: string): Promise<void> {
    const normalized = normalizeRelayUrl(url);
    const list = this.configuredRelays.get().filter((u) => normalizeRelayUrl(u) !== normalized);
    if (list.length === 0) return; // never empty the rail
    this.configuredRelays.set(list);
    this.persistRelays();
    if (normalizeRelayUrl(this.currentRelayUrl.get()) === normalized) {
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
  subscribeRelayAccess(cb: (byRelay: Readonly<Record<string, RelayAccessState>>) => void): Unsubscribe {
    return this.relayAccess.subscribe(cb);
  }

  /**
   * Resolve once the **current** relay reports `'ok'` (NIP-42 AUTH
   * completed and the first read succeeded), or after `timeoutMs`
   * elapses. The mesh voice transport awaits this before publishing
   * the first beacon so the bringup burst doesn't fire into a
   * still-handshaking socket. Always resolves — never rejects — so
   * callers can `.catch(() => null)` without special-casing the
   * timeout path.
   *
   * Returns `'ok'` on success, `'timeout'` on deadline, or whatever
   * non-ok state the relay landed on if the deadline elapses while
   * the relay is in a terminal state like `'auth-required'` or
   * `'restricted'`.
   */
  waitForRelayAuth(timeoutMs: number): Promise<'ok' | 'timeout' | RelayAccessState> {
    return new Promise((resolve) => {
      const url = this.currentRelayUrl.get();
      const initial = this.relayAccess.get()[url];
      if (initial === 'ok') return resolve('ok');
      let unsub: Unsubscribe | null = null;
      const timer = setTimeout(() => {
        if (unsub) unsub();
        const cur = this.relayAccess.get()[this.currentRelayUrl.get()];
        resolve(cur === 'ok' ? 'ok' : (cur ?? 'timeout'));
      }, timeoutMs);
      unsub = this.relayAccess.subscribe((byRelay) => {
        const state = byRelay[this.currentRelayUrl.get()];
        if (state === 'ok') {
          clearTimeout(timer);
          if (unsub) unsub();
          resolve('ok');
        }
      });
    });
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
  subscribeGroupMetadataEose(cb: (eose: boolean) => void): Unsubscribe {
    return this.groupMetadataEose.subscribe(cb);
  }
  subscribeMessages(groupId: string, cb: (msgs: ReadonlyArray<JsMessage>) => void): Unsubscribe {
    // Belt-and-braces: messages start streaming as soon as group metadata
    // arrives (see ingestGroupMetadata). This call is idempotent and only
    // matters for groups the user opens via deep link before metadata lands.
    this.subscribeGroupMessages(groupId);
    const adapter: Listener<Record<string, JsMessage[]>> = (byGroup) => cb(byGroup[groupId] ?? []);
    return this.messagesByGroup.subscribe(adapter);
  }
  subscribeMessagesByGroup(
    cb: (byGroup: Readonly<Record<string, ReadonlyArray<JsMessage>>>) => void,
  ): Unsubscribe {
    return this.messagesByGroup.subscribe(cb);
  }
  /**
   * Per-group EOSE flag for the kind 9 messages REQ. Fires `false` until
   * the relay has emitted EOSE for this group's subscription, then `true`.
   * Lets the chat pane distinguish "still loading from relay" from "relay
   * confirmed empty" without hand-rolling timeouts. Calling this also
   * fast-tracks the subscription so a freshly-mounted pane prioritizes
   * the channel the user is actively looking at.
   */
  subscribeMessagesEose(groupId: string, cb: (eose: boolean) => void): Unsubscribe {
    this.subscribeGroupMessages(groupId);
    const adapter: Listener<Record<string, boolean>> = (m) => cb(!!m[groupId]);
    return this.messagesEoseByGroup.subscribe(adapter);
  }
  /**
   * Per-group confidence enum for the kind 9 messages stream. The chat
   * pane reads this to decide between "Loading messages…" and
   * "No messages yet". See {@link MessagesStatus} for transitions.
   * Subscribing also fast-tracks the underlying REQ, matching
   * {@link subscribeMessagesEose}'s behavior.
   */
  subscribeMessagesStatus(
    groupId: string,
    cb: (status: MessagesStatus) => void,
  ): Unsubscribe {
    this.subscribeGroupMessages(groupId);
    const adapter: Listener<Record<string, MessagesStatus>> = (m) => cb(m[groupId] ?? 'loading');
    return this.messagesStatusByGroup.subscribe(adapter);
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

  subscribeMyMutes(cb: (pubkeys: ReadonlyArray<string>) => void): Unsubscribe {
    return this.myMutes.subscribe(cb);
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

  subscribeMembersByGroup(
    cb: (byGroup: Readonly<Record<string, ReadonlyArray<string>>>) => void,
  ): Unsubscribe {
    return this.membersByGroup.subscribe(cb);
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
    // Skip the kind:0 REQ for resolved-deny pubkeys to avoid amplifying
    // unwanted authors into our outbound subscription set. Unknown verdicts
    // still get a REQ — they may resolve to allow later.
    if (wotEngine.isResolvedDeny(pubkey)) return;
    this.metadataRequested.add(pubkey);
    this.subscribeKind0(pubkey);
  }

  // -- Group operations --------------------------------------------------

  async sendMessage(groupId: string, content: string, replyTo?: { id: string; pubkey: string } | null): Promise<void> {
    if (!this.session) throw new Error('Not logged in');
    const clientTag = generateClientTag();
    const createdAt = Math.floor(Date.now() / 1000);
    const replyToCopy = replyTo ? { id: replyTo.id, pubkey: replyTo.pubkey } : null;
    const pendingMsg: JsMessage = {
      id: `pending:${clientTag}`,
      pubkey: this.session.pubKeyHex,
      content,
      createdAt,
      kind: KIND_GROUP_MESSAGE,
      replyToId: replyToCopy?.id ?? null,
      mentions: [],
      pending: true,
      clientTag,
    };
    this.pendingGroupSends.set(clientTag, { groupId, content, replyTo: replyToCopy, createdAt });
    this.upsertPendingGroupMessage(groupId, pendingMsg);
    void this.publishGroupMessage(groupId, content, replyToCopy, clientTag, createdAt);
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
    const clientTag = generateClientTag();
    const createdAt = Math.floor(Date.now() / 1000);
    const pendingMsg: JsDirectMessage = {
      id: `pending:${clientTag}`,
      counterparty: recipientPubkey,
      outgoing: true,
      content,
      createdAt,
      pending: true,
      clientTag,
    };
    this.pendingDMSends.set(clientTag, { recipientPubkey, content, createdAt });
    this.upsertPendingDM(recipientPubkey, pendingMsg);
    void this.publishDirectMessage(recipientPubkey, content, clientTag, createdAt);
  }

  private async publishDirectMessage(
    recipientPubkey: string,
    content: string,
    clientTag: string,
    createdAt: number,
  ): Promise<void> {
    try {
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
          created_at: createdAt,
        },
        extraRelays,
      );
      this.replacePendingDM(recipientPubkey, clientTag, event, content);
    } catch (err) {
      this.markDMFailed(recipientPubkey, clientTag, err instanceof Error ? err.message : String(err));
    }
  }

  private async publishGroupMessage(
    groupId: string,
    content: string,
    replyTo: { id: string; pubkey: string } | null,
    clientTag: string,
    createdAt: number,
  ): Promise<void> {
    const tags: string[][] = [['h', groupId]];
    if (replyTo) {
      tags.push(['e', replyTo.id, '', 'reply']);
      tags.push(['p', replyTo.pubkey]);
    }
    try {
      const event = await this.signAndPublish({
        kind: KIND_GROUP_MESSAGE,
        content,
        tags,
        created_at: createdAt,
      });
      this.replacePendingGroupMessage(groupId, clientTag, event);
    } catch (err) {
      this.markGroupMessageFailed(groupId, clientTag, err instanceof Error ? err.message : String(err));
    }
  }

  async retryMessage(groupId: string, clientTag: string): Promise<void> {
    const args = this.pendingGroupSends.get(clientTag);
    if (!args) return;
    // Only retry from a failed state — prevents double-publishing if the
    // user double-taps Retry while a previous attempt is still in flight.
    const list = this.messagesByGroup.get()[groupId] ?? [];
    const msg = list.find((m) => m.clientTag === clientTag);
    if (!msg || !msg.failed) return;
    this.flipPendingGroupMessageToPending(groupId, clientTag);
    void this.publishGroupMessage(args.groupId, args.content, args.replyTo, clientTag, args.createdAt);
  }

  async retryDirectMessage(counterparty: string, clientTag: string): Promise<void> {
    const args = this.pendingDMSends.get(clientTag);
    if (!args) return;
    const list = this.dmsByPeer.get()[counterparty] ?? [];
    const msg = list.find((m) => m.clientTag === clientTag);
    if (!msg || !msg.failed) return;
    this.flipPendingDMToPending(counterparty, clientTag);
    void this.publishDirectMessage(args.recipientPubkey, args.content, clientTag, args.createdAt);
  }

  cancelPendingMessage(groupId: string, clientTag: string): void {
    this.pendingGroupSends.delete(clientTag);
    this.messagesByGroup.update((prev) => {
      const existing = prev[groupId];
      if (!existing) return prev;
      const next = existing.filter((m) => m.clientTag !== clientTag);
      if (next.length === existing.length) return prev;
      return { ...prev, [groupId]: next };
    });
  }

  cancelPendingDirectMessage(counterparty: string, clientTag: string): void {
    this.pendingDMSends.delete(clientTag);
    this.dmsByPeer.update((prev) => {
      const existing = prev[counterparty];
      if (!existing) return prev;
      const next = existing.filter((m) => m.clientTag !== clientTag);
      if (next.length === existing.length) return prev;
      return { ...prev, [counterparty]: next };
    });
  }

  private upsertPendingGroupMessage(groupId: string, msg: JsMessage): void {
    this.messagesByGroup.update((prev) => {
      const existing = prev[groupId] ?? [];
      const next = [...existing, msg].sort((a, b) => a.createdAt - b.createdAt);
      return { ...prev, [groupId]: next };
    });
  }

  private replacePendingGroupMessage(groupId: string, clientTag: string, ev: NostrEvent): void {
    // Once the relay returns the real event, drop the args — a retry from
    // here would re-publish a finalized message.
    this.pendingGroupSends.delete(clientTag);
    const replyTo = ev.tags.find((t) => t[0] === 'e' && t[3] === 'reply')?.[1] ?? null;
    const mentions = extractMentionPubkeysFromMessage(ev.content, ev.tags);
    const realMsg: JsMessage = {
      id: ev.id,
      pubkey: ev.pubkey,
      content: ev.content,
      createdAt: ev.created_at,
      kind: ev.kind,
      replyToId: replyTo,
      mentions,
    };
    this.messagesByGroup.update((prev) => {
      const existing = prev[groupId] ?? [];
      const realPresent = existing.some((m) => m.id === realMsg.id);
      // The relay echo may have raced through ingestMessage first — in that
      // case the placeholder is already gone (ingestMessage replaces it by
      // tuple match) so this update is a no-op.
      if (realPresent) {
        const filtered = existing.filter((m) => m.clientTag !== clientTag);
        if (filtered.length === existing.length) return prev;
        return { ...prev, [groupId]: filtered };
      }
      let replaced = false;
      const swapped = existing.map((m) => {
        if (m.clientTag === clientTag) {
          replaced = true;
          return realMsg;
        }
        return m;
      });
      if (!replaced) {
        // Placeholder was canceled before the publish ack landed — append
        // the real event so the user sees the message they sent.
        return { ...prev, [groupId]: [...existing, realMsg].sort((a, b) => a.createdAt - b.createdAt) };
      }
      swapped.sort((a, b) => a.createdAt - b.createdAt);
      return { ...prev, [groupId]: swapped };
    });
    this.ensureUserMetadata(ev.pubkey);
  }

  private markGroupMessageFailed(groupId: string, clientTag: string, _err: string): void {
    this.messagesByGroup.update((prev) => {
      const existing = prev[groupId];
      if (!existing) return prev;
      let touched = false;
      const next = existing.map((m) => {
        if (m.clientTag !== clientTag) return m;
        touched = true;
        return { ...m, pending: false, failed: true };
      });
      if (!touched) return prev;
      return { ...prev, [groupId]: next };
    });
  }

  private flipPendingGroupMessageToPending(groupId: string, clientTag: string): void {
    this.messagesByGroup.update((prev) => {
      const existing = prev[groupId];
      if (!existing) return prev;
      let touched = false;
      const next = existing.map((m) => {
        if (m.clientTag !== clientTag) return m;
        touched = true;
        return { ...m, pending: true, failed: false };
      });
      if (!touched) return prev;
      return { ...prev, [groupId]: next };
    });
  }

  private upsertPendingDM(counterparty: string, msg: JsDirectMessage): void {
    this.dmsByPeer.update((prev) => {
      const existing = prev[counterparty] ?? [];
      const next = [...existing, msg].sort((a, b) => a.createdAt - b.createdAt);
      return { ...prev, [counterparty]: next };
    });
  }

  private replacePendingDM(
    counterparty: string,
    clientTag: string,
    ev: NostrEvent,
    plaintext: string,
  ): void {
    this.pendingDMSends.delete(clientTag);
    const realMsg: JsDirectMessage = {
      id: ev.id,
      counterparty,
      outgoing: true,
      content: plaintext,
      createdAt: ev.created_at,
    };
    this.dmsByPeer.update((prev) => {
      const existing = prev[counterparty] ?? [];
      const realPresent = existing.some((m) => m.id === realMsg.id);
      if (realPresent) {
        const filtered = existing.filter((m) => m.clientTag !== clientTag);
        if (filtered.length === existing.length) return prev;
        return { ...prev, [counterparty]: filtered };
      }
      let replaced = false;
      const swapped = existing.map((m) => {
        if (m.clientTag === clientTag) {
          replaced = true;
          return realMsg;
        }
        return m;
      });
      if (!replaced) {
        return { ...prev, [counterparty]: [...existing, realMsg].sort((a, b) => a.createdAt - b.createdAt) };
      }
      swapped.sort((a, b) => a.createdAt - b.createdAt);
      return { ...prev, [counterparty]: swapped };
    });
    this.ensureUserMetadata(counterparty);
  }

  private markDMFailed(counterparty: string, clientTag: string, _err: string): void {
    this.dmsByPeer.update((prev) => {
      const existing = prev[counterparty];
      if (!existing) return prev;
      let touched = false;
      const next = existing.map((m) => {
        if (m.clientTag !== clientTag) return m;
        touched = true;
        return { ...m, pending: false, failed: true };
      });
      if (!touched) return prev;
      return { ...prev, [counterparty]: next };
    });
  }

  private flipPendingDMToPending(counterparty: string, clientTag: string): void {
    this.dmsByPeer.update((prev) => {
      const existing = prev[counterparty];
      if (!existing) return prev;
      let touched = false;
      const next = existing.map((m) => {
        if (m.clientTag !== clientTag) return m;
        touched = true;
        return { ...m, pending: true, failed: false };
      });
      if (!touched) return prev;
      return { ...prev, [counterparty]: next };
    });
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
    kind?: 'text' | 'voice' | 'voice-sfu' | 'forum';
    parent?: string;
    forumTags?: ReadonlyArray<JsForumTag>;
    topics?: ReadonlyArray<string>;
  }): Promise<string> {
    const groupId = opts.groupId ?? generateGroupId();
    await this.signAndPublish({
      kind: KIND_GROUP_CREATE,
      content: '',
      tags: [['h', groupId]],
      created_at: Math.floor(Date.now() / 1000),
    });
    // Optimistically record the creator locally so claimCreatorAdmin works
    // without waiting for the relay to round-trip our own kind 9007 back. The
    // explicit creator-admin claim used to live here as an unconditional
    // putUser; that fired a kind 9000 even on relays that already auto-promoted
    // the creator, polluting the moderation log. The claim is now lazy —
    // ManageGroup / settings-open paths call `claimCreatorAdmin` only if 39001
    // doesn't already include the local user.
    if (this.session) {
      this.groupCreators.update((m) => ({ ...m, [groupId]: this.session!.pubKeyHex }));
      cacheSet(this.currentRelayUrl.get(), KIND_GROUP_CREATE, groupId, this.session.pubKeyHex);
    }
    await this.editGroupMetadata({ ...opts, groupId });
    return groupId;
  }

  async putUser(
    groupId: string,
    pubkey: string,
    roles?: ReadonlyArray<string>,
    opts?: { quiet?: boolean },
  ): Promise<void> {
    const pTag: string[] = ['p', pubkey];
    if (roles && roles.length > 0) pTag.push(...roles);
    await this.signAndPublish(
      {
        kind: KIND_GROUP_PUT_USER,
        content: '',
        tags: [['h', groupId], pTag],
        created_at: Math.floor(Date.now() / 1000),
      },
      [],
      opts,
    );
  }

  async removeUser(groupId: string, pubkey: string): Promise<void> {
    await this.signAndPublish({
      kind: KIND_GROUP_REMOVE_USER,
      content: '',
      tags: [['h', groupId], ['p', pubkey]],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  /**
   * NIP-29 9003 remove-permission. Strips one or more roles from a user's
   * `p` entry on the next 39001/39002 broadcast without removing them from
   * the group. The most common use is demoting an admin to a plain member
   * (`permissions = ['admin']`).
   */
  async removePermission(
    groupId: string,
    pubkey: string,
    permissions: ReadonlyArray<string>,
  ): Promise<void> {
    if (permissions.length === 0) return;
    const pTag: string[] = ['p', pubkey, ...permissions];
    await this.signAndPublish({
      kind: KIND_GROUP_REMOVE_PERMISSION,
      content: '',
      tags: [['h', groupId], pTag],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  /**
   * One-shot kind 9000 admin claim, only fired when:
   *   - we know the kind 9007 author of `groupId` (from {@link groupCreators}),
   *     and it equals the active session pubkey, AND
   *   - the local user is not already in the relay-published 39001 admin list.
   *
   * Replaces the previous blanket login-time auto-claim loop in AppShell which
   * published a kind 9000 admin for every visible group on every login. This
   * helper is meant to be called from settings-open / create-group flows where
   * the user's intent to administer the channel is explicit. Returns `true`
   * when an event was published, `false` when the call was a no-op (not the
   * creator, already an admin, or no session).
   */
  async claimCreatorAdmin(groupId: string): Promise<boolean> {
    if (!this.session) return false;
    const me = this.session.pubKeyHex;
    if (this.groupCreators.get()[groupId] !== me) return false;
    const admins = this.adminsByGroup.get()[groupId] ?? [];
    if (admins.includes(me)) return false;
    // Best-effort background write: if the relay accepts it the local
    // creator becomes a relay-confirmed admin on the next 39001 broadcast;
    // if the relay declines (whitelist, "not authorized to add users"),
    // the user's actual settings/ManageGroup actions will surface the
    // real error. Don't toast for this background attempt.
    await this.putUser(groupId, me, ['admin'], { quiet: true });
    return true;
  }

  /** Reactive subscription over the kind 9007 creator map (groupId -> pubkey). */
  subscribeGroupCreators(cb: (byGroup: Readonly<Record<string, string>>) => void): Unsubscribe {
    return this.groupCreators.subscribe(cb);
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
    kind?: 'text' | 'voice' | 'voice-sfu' | 'forum';
    parent?: string;
    forumTags?: ReadonlyArray<JsForumTag>;
    topics?: ReadonlyArray<string>;
  }): Promise<void> {
    const tags: string[][] = [['h', opts.groupId]];
    if (opts.name !== undefined) tags.push(['name', opts.name]);
    if (opts.about !== undefined) tags.push(['about', opts.about]);
    if (opts.picture !== undefined) tags.push(['picture', opts.picture]);
    if (opts.banner !== undefined) tags.push(['banner', opts.banner]);
    if (opts.isPublic !== undefined) tags.push([opts.isPublic ? 'public' : 'private']);
    if (opts.isOpen !== undefined) tags.push([opts.isOpen ? 'open' : 'closed']);
    if (opts.parent !== undefined && opts.parent) tags.push(['parent', opts.parent]);
    // The variant marker is "just another tag" on kind 9002; the relay
    // reflects it on kind 39000 like name/about. Omitting the tag
    // (kind: 'text') makes a previously-voice/forum channel revert to a
    // regular text channel.
    if (opts.kind === 'voice') tags.push(['t', 'voice']);
    else if (opts.kind === 'voice-sfu') tags.push(['t', 'voice-sfu']);
    else if (opts.kind === 'forum') tags.push(['t', 'forum']);
    // Curated forum tags (admin) + thread topic references. Kind 9002 is a
    // full replacement, so callers MUST pass the full intended set on every
    // edit. The new ForumView chrome and ChannelSettingsModal both load the
    // current set into local state and pass it back on save to preserve it.
    if (opts.forumTags) {
      for (const ft of opts.forumTags) {
        if (!ft.id || !ft.name) continue;
        tags.push(ft.emoji ? ['forum-tag', ft.id, ft.name, ft.emoji] : ['forum-tag', ft.id, ft.name]);
      }
    }
    if (opts.topics) {
      for (const id of opts.topics) {
        if (id) tags.push(['topic', id]);
      }
    }
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
        mentions: extractMentionPubkeysFromMessage(e.content, e.tags),
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

    await this.signAndPublish(
      {
        kind: KIND_USER_METADATA,
        content: JSON.stringify(merged),
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      },
      PROFILE_RELAYS,
    );
  }

  /**
   * Add or remove a pubkey from the local user's NIP-51 kind 10000 mute list.
   * Fetches the latest kind 10000 first so unrelated entries (events,
   * hashtags, encrypted content) are preserved, then republishes with the
   * adjusted `p` tags. Updates `myMutes` optimistically so the UI reflects
   * the change without waiting for the relay echo.
   */
  async setMuted(pubkey: string, muted: boolean): Promise<void> {
    if (!this.session) throw new Error('Not logged in');
    const me = this.session.pubKeyHex;
    const muteRelays = Array.from(new Set([...this.relays, ...PROFILE_RELAYS]));

    // Pull the latest kind 10000 so we don't drop encrypted content or
    // non-`p` tags published by other clients.
    let existingTags: string[][] = [];
    let existingContent = '';
    try {
      const ev = await this.pool.get(muteRelays, { kinds: [KIND_MUTE_LIST], authors: [me] });
      if (ev) {
        existingTags = ev.tags;
        existingContent = ev.content;
      }
    } catch {
      // ignore — start from empty
    }

    const otherTags = existingTags.filter((t) => !(t[0] === 'p' && t[1] === pubkey));
    const nextTags = muted ? [...otherTags, ['p', pubkey]] : otherTags;

    // Optimistic update so consumers (useMessages / useDirectMessages) hide
    // the user immediately; the relay echo will overwrite this with the
    // canonical list via subscribeMyMuteList.
    const current = this.myMutes.get();
    const optimistic = muted
      ? current.includes(pubkey) ? current : [...current, pubkey]
      : current.filter((p) => p !== pubkey);
    this.myMutes.set(optimistic);

    await this.signAndPublish(
      {
        kind: KIND_MUTE_LIST,
        content: existingContent,
        tags: nextTags,
        created_at: Math.floor(Date.now() / 1000),
      },
      PROFILE_RELAYS,
    );
  }

  async loadMoreMessages(groupId: string): Promise<boolean> {
    // Page older messages on demand. Live REQ stays capped at
    // BACKGROUND_MESSAGE_LIMIT; "Load earlier" calls this with the oldest
    // currently-rendered message as the upper bound. Returns true when at
    // least one previously-unseen event was ingested, so the caller can
    // distinguish "more available" from "reached the start of history".
    const existing = this.messagesByGroup.get()[groupId] ?? [];
    if (existing.length === 0) return false;
    const oldest = existing.reduce((a, m) => (m.createdAt < a ? m.createdAt : a), existing[0].createdAt);
    const filter: Filter = {
      kinds: [KIND_GROUP_MESSAGE],
      '#h': [groupId],
      until: oldest - 1,
      limit: LOAD_MORE_PAGE_SIZE,
    };
    let events: NostrEvent[];
    try {
      events = await this.pool.querySync(this.relays, filter, { maxWait: 5000 });
    } catch {
      return false;
    }
    let added = 0;
    for (const ev of events) {
      const before = this.messagesByGroup.get()[groupId]?.length ?? 0;
      this.ingestMessage(groupId, ev);
      const after = this.messagesByGroup.get()[groupId]?.length ?? 0;
      if (after > before) added++;
    }
    return added > 0;
  }

  /**
   * Fetch a single group's kind 39000 metadata on demand. Used by the chat
   * pane when it mounts onto a `groupId` that isn't in the bridge's
   * `groups` store yet — the global metadata stream is supposed to catch
   * every group, but slow / silent-filtering relays can miss specific ids
   * for a session. A focused `querySync` with `#d:[groupId]` gives the
   * relay exactly one event to deliver and unblocks the chat pane without
   * waiting for a full page refresh.
   *
   * Returns `true` when at least one previously-unseen 39000 event was
   * ingested.
   */
  async fetchGroupMetadata(groupId: string): Promise<boolean> {
    if (!groupId) return false;
    const filter: Filter = {
      kinds: [KIND_GROUP_METADATA],
      '#d': [groupId],
      limit: 1,
    };
    let events: NostrEvent[];
    try {
      events = await this.pool.querySync(this.relays, filter, { maxWait: 4000 });
    } catch {
      return false;
    }
    let added = 0;
    for (const ev of events) {
      const before = this.groups.get().length;
      this.ingestGroupMetadata(ev);
      const after = this.groups.get().length;
      if (after > before) added++;
    }
    return added > 0;
  }

  setActiveGroup(groupId: string | null): void {
    const previousActive = this.activeGroupId;
    this.activeGroupId = groupId;
    // Switching away from a still-loading channel? Resume the background
    // queue drain so other channels' subs aren't held forever.
    if (previousActive && previousActive !== groupId) {
      this.maybeResumeMessageQueueDrain();
    }
    if (!groupId) return;
    // Re-entering a channel that was previously declared empty-confirmed
    // is the canonical "stale empty" recovery path. The bridge owns this
    // restart so the UI never has to fire its own refresh effect.
    const currentStatus = this.messagesStatusByGroup.get()[groupId];
    const msgs = this.messagesByGroup.get()[groupId] ?? [];
    if (currentStatus === 'empty-confirmed' && msgs.length === 0) {
      this.clearMessagesRetry(groupId);
      this.internalRestartMessageSub(groupId);
      return;
    }
    // Fast-track the channel the user just clicked: if the kind 9 REQ
    // hasn't been fired yet (because metadata is still streaming or this
    // group was sitting in the background queue from the kind 39000
    // fan-out), promote it now so the relay's first response is the
    // channel actually in view.
    this.bumpGroupMessagesPriority(groupId);
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
  }, opts: PublishOpts = {}): Promise<NostrEvent> {
    return this.signAndPublish(
      {
        kind: template.kind,
        content: template.content,
        tags: template.tags,
        created_at: template.created_at ?? Math.floor(Date.now() / 1000),
      },
      opts,
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

  /**
   * Watched variant of {@link subscribeFilter}. Use this for any non-message
   * data that paints the chrome of the app — relay branding, channel layout,
   * group metadata fan-out — so a NIP-42 AUTH race or transient blip doesn't
   * silently drop the REQ and force the user to refresh. Wraps the sub with
   * the same watchdog the per-group subscriptions use.
   */
  subscribeFilterWatched(
    filter: Filter,
    onEvent: (ev: NostrEvent) => void,
    options?: { watchdogMs?: number; maxAttempts?: number; relays?: readonly string[] },
  ): () => void {
    // Optional `relays` override merges with the bridge's default relay
    // list. Used by callers that need to listen on relays the bridge
    // hasn't been switched to — e.g. the SFU RPC client, where the SFU
    // only publishes responses to its trusted relays (relay.obelisk.ar)
    // while the dex tab might be on public.obelisk.ar. Without the
    // override, getRouterRtpCapabilities responses never reach the
    // browser and `start()` times out at 8s.
    const targetRelays = options?.relays && options.relays.length > 0
      ? Array.from(new Set([...this.relays, ...options.relays]))
      : this.relays;
    if (options?.relays) {
      // Tell auto-auth to sign for these too — without this the relay
      // can challenge us, our auto-auth declines because they aren't
      // in `this.relays`, and the sub never delivers events. The set
      // is leaky on purpose: removing on close would race with future
      // overlapping subs to the same relay (e.g. a second voice channel
      // on the same SFU). The cost is signing AUTH on a relay we no
      // longer subscribe to, which is harmless.
      for (const r of options.relays) this.authAllowedRelays.add(normalizeRelayUrl(r));
    }
    const sub = this.subscribeWatched(targetRelays, filter, onEvent, undefined, options);
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
   *   - `maxAttempts`: how many times to retry before giving up. Defaults
   *     to `Infinity` for critical paths (group metadata, messages,
   *     admin/member, DMs, contact list) — losing those means an empty UI
   *     and the user shouldn't have to refresh to recover. Backoff still
   *     applies (1s/2s/4s/8s, capped at 30s) so a permanently-broken relay
   *     doesn't burn CPU. Non-critical paths (kind:0 metadata, reactions)
   *     override with `maxAttempts: 2` since a missed retry there just
   *     delays a display-name resolve or an emoji badge.
   */
  private subscribeWatched(
    relays: string[],
    filter: Filter,
    onevent: (ev: NostrEvent) => void,
    oneose?: () => void,
    options?: {
      watchdogMs?: number;
      maxAttempts?: number;
      affectsRelayAccess?: boolean;
      /**
       * When true, an `auth-required` / `restricted` CLOSED for this sub
       * downgrades relay-access state **immediately** (no 4s soak). Used
       * by the dedicated preflight REQ in {@link preflightRelayAccess} so
       * the user sees a "Not whitelisted" banner within ~1.5s instead of
       * waiting through the deferred soak window. Other subs keep the
       * soak so transient AUTH races don't flash the banner.
       */
      immediateAccessDowngrade?: boolean;
    },
  ): { close: () => void; markClosed: () => void } {
    const WATCHDOG_MS = options?.watchdogMs ?? 5000;
    const MAX_ATTEMPTS = options?.maxAttempts ?? Infinity;
    // Per-channel / per-pubkey subs (group messages, admin/member, single
    // user metadata) get CLOSED for normal "you can't see this one" reasons
    // — private channels you aren't a member of, profile relays that don't
    // serve the queried pubkey, etc. Those CLOSEDs must NOT flip the
    // relay-wide access banner; otherwise the user sees "Not whitelisted"
    // even when their global metadata sub is delivering everything fine.
    const AFFECTS_ACCESS = options?.affectsRelayAccess ?? true;
    const IMMEDIATE_ACCESS_DOWNGRADE = options?.immediateAccessDowngrade ?? false;
    const MAX_BACKOFF_MS = 30_000;
    let attempt = 0;
    let activeSub: { close: () => void } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let alive = false;
    // Single retry token shared by the watchdog and the onclose-driven retry.
    // Whichever path acts first flips it to false so the same failure event
    // can never schedule two retries. Disarmed by `onevent` (a delivered event
    // proves success) but NOT by `oneose` — empty EOSE before NIP-42 AUTH
    // completes is exactly the bug we're guarding against here.
    let armed = false;

    const clearTimer = () => {
      if (timer) { clearTimeout(timer); timer = null; }
    };

    // Common funnel for "this attempt is dead, schedule the next start()".
    // `immediate` skips backoff for the first onclose-driven retry: the relay
    // has already issued AUTH, so re-firing the REQ in the next tick lets
    // nostr-tools attach AUTH and deliver. Subsequent failures still hit the
    // backoff because `attempt` keeps incrementing in start().
    const scheduleRetry = (immediate: boolean) => {
      if (closed || !armed) return;
      armed = false;
      clearTimer();
      try { activeSub?.close(); } catch { /* ignore */ }
      activeSub = null;
      if (attempt >= MAX_ATTEMPTS) return;
      const delay = immediate ? 0 : Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
      timer = setTimeout(start, delay);
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
      if (closed || alive || !armed) return;
      if (authPending) {
        // Don't kill the sub while a human is staring at an approval popup.
        timer = setTimeout(onWatchdog, WATCHDOG_MS);
        return;
      }
      scheduleRetry(false);
    };

    const start = () => {
      if (closed) return;
      attempt++;
      alive = false;
      armed = true;
      const sub = this.pool.subscribe(relays, filter, {
        onevent: (ev) => {
          // switchRelay / resetPoolForSessionChange / dispose call markClosed
          // on every active sub but deliberately skip pool.close() to avoid
          // per-sub CLOSING/CLOSED console spam (see resetPoolForSessionChange
          // comment). The old pool's WebSockets stay open until GC, so events
          // can still be delivered here after `closed = true`. Without this
          // guard, an in-flight kind 39000 from relay A would be ingested
          // into the post-switch state for relay B — both polluting
          // `this.groups` and writing A's group under B's cache key via
          // `cacheSet(this.currentRelayUrl.get(), ...)` in the ingest
          // functions. That's the "channels from another relay leaking into
          // Uncategorized" bug.
          if (closed) return;
          alive = true;
          armed = false;
          clearTimer();
          // Any event delivered means the relay is reading us — auth (if
          // required) succeeded and we're not whitelist-blocked. Mark the
          // active relay 'ok' (helper no-ops for non-active relays).
          if (AFFECTS_ACCESS) {
            for (const url of relays) this.setRelayAccess(url, 'ok');
          }
          // WoT / mute / block gate. The engine fails-open until a verdict
          // resolves; resolved-deny events are dropped here so they never
          // reach ingest, the cache, or `messagesByGroup`. When the engine
          // is disabled the predicate is a constant `true` and this is a
          // no-op. See docs/wot-integration-plan.md.
          if (!wotEngine.isAllowed(ev.pubkey, ev.kind)) return;
          onevent(ev);
        },
        oneose: () => {
          // Same staleness guard as onevent — a late EOSE on a markClosed sub
          // would otherwise flip flags like `groupMetadataEose` for the new
          // relay based on the old relay's response.
          if (closed) return;
          alive = true;
          // Intentionally do NOT disarm here. EOSE alone is not proof of
          // success on auth-gated relays — they routinely send EOSE (empty
          // result) before CLOSED auth-required. Leaving `armed` true lets
          // the onclose handler below schedule a retry.
          clearTimer();
          if (AFFECTS_ACCESS) {
            for (const url of relays) this.setRelayAccess(url, 'ok');
          }
          oneose?.();
        },
        onclose: (reasons: string[]) => {
          // Stale onclose from the old pool's WebSocket finally tearing down
          // shouldn't update relay-access state or trigger retries against
          // the new pool. `scheduleRetry` already short-circuits via
          // `closed`, but bail early so we don't even classify reasons.
          if (closed) return;
          // nostr-tools fires onclose with one reason string per relay,
          // index-aligned with the `relays` array. Local closes look like
          // 'closed by caller' and yield no rejection match — we leave the
          // existing state alone in that case.
          let shouldRetry = false;
          let unknownClose = false;
          reasons.forEach((reason, i) => {
            if (!reason) return;
            const url = relays[i];
            const state = parseRelayRejection(reason);
            if (state) {
              if (state === 'auth-required' || state === 'restricted') {
                // A per-channel CLOSED ("you can't read this one") still
                // schedules a retry, but it does NOT update the relay-wide
                // banner — see AFFECTS_ACCESS comment above.
                if (AFFECTS_ACCESS) {
                  if (IMMEDIATE_ACCESS_DOWNGRADE) {
                    // Preflight path — surface "Not whitelisted" within the
                    // sub's own watchdog window, no 4s soak.
                    this.setRelayAccess(url, state);
                  } else {
                    this.setRelayAccessDeferred(url, state);
                  }
                }
                shouldRetry = true;
              } else if (AFFECTS_ACCESS) {
                this.setRelayAccess(url, state);
              }
            } else {
              // Reason carried but didn't classify — typically a transient
              // quota / rate-limit ("Subscription quota exceeded: 50/50",
              // "too many concurrent REQs"). Backoff-retry rather than
              // immediate-retry so we don't blast the relay at the exact
              // moment its quota is full and trigger a sub-flood.
              unknownClose = true;
            }
          });
          // Retry on auth-required/restricted immediately — EOSE-then-CLOSED
          // race. `scheduleRetry` short-circuits via `armed` if onevent
          // already succeeded or the watchdog already fired.
          if (shouldRetry) scheduleRetry(true);
          else if (unknownClose) scheduleRetry(false);
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
        // Only attempt the network CLOSE frame if the pool's socket is
        // still alive — calling close() on a dead WebSocket throws a
        // browser warning per sub ("WebSocket is already in CLOSING or
        // CLOSED state") that the try/catch can't suppress because it's
        // logged at the WebSocket layer, not raised as an exception.
        if (!this.poolSocketAlive) {
          activeSub = null;
          return;
        }
        try { activeSub?.close(); } catch { /* ignore */ }
      },
      // For pool-replacement paths (resetPoolForSessionChange / switchRelay /
      // dispose). Marks the closure dead so its retry/watchdog logic stops,
      // but does NOT send a CLOSE frame on the WebSocket — the caller will
      // call pool.close() once for the whole pool right after, and the
      // duplicate per-sub CLOSE racing with the pool teardown is what
      // produces the "WebSocket is already in CLOSING or CLOSED state"
      // warnings users were seeing on re-login.
      markClosed: () => {
        closed = true;
        clearTimer();
        activeSub = null;
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
      return await trackActivity(
        'Waiting for extension signature',
        () => win.signEvent(fullTemplate) as Promise<NostrEvent>,
        `kind ${template.kind}`,
      );
    }
    if (this.session.loginMethod === 'bunker') {
      const b = await this.ensureBunkerSigner();
      return await trackActivity(
        'Waiting for bunker signature',
        () => b.signEvent(fullTemplate) as Promise<NostrEvent>,
        `kind ${template.kind}`,
      );
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
      // Surface NIP-42 AUTH prompts in the activity log so the
      // "Waiting for signature" toast persists for the entire round-trip
      // — without this, the only visible toast was "Publishing to relays"
      // even though the user was being asked to approve a sign in their
      // extension or bunker.
      if (this.session?.loginMethod === 'nip07') {
        const win = (window as any).nostr;
        if (!win) throw new Error('NIP-07 extension unavailable');
        return await trackActivity(
          'Waiting for extension signature',
          () => win.signEvent(evt) as Promise<VerifiedEvent>,
          'NIP-42 relay auth',
        );
      }
      if (this.session?.loginMethod === 'bunker') {
        const b = await this.ensureBunkerSigner();
        return await trackActivity(
          'Waiting for bunker signature',
          () => b.signEvent(evt as unknown as EventTemplate & { pubkey: string }) as Promise<VerifiedEvent>,
          'NIP-42 relay auth',
        );
      }
      throw new Error('Cannot sign auth event with current login method');
    };
  }

  /**
   * Side-effect runner for {@link runConnectFanOut}. The orchestrator owns
   * tier ordering; this method translates a {@link TierAction} into the
   * matching `subscribeXxx` call. Keeping this dispatch table in one place
   * makes the priority tiers grep-able from the orchestrator file.
   */
  private dispatchOrchestratorAction(action: TierAction): void {
    switch (action) {
      case 'preflightRelayAccess':
        if (this.session) this.preflightRelayAccess();
        break;
      case 'subscribeGroupMetadata':
        this.subscribeGroupMetadata();
        break;
      case 'ensureMyMetadata':
        if (this.session) this.ensureUserMetadata(this.session.pubKeyHex);
        break;
      case 'subscribeAllAdminMember':
        this.subscribeAllAdminMember();
        break;
      case 'subscribeIncomingDMs':
        this.subscribeIncomingDMs();
        break;
      case 'subscribeMyContactList':
        this.subscribeMyContactList();
        break;
      case 'subscribeMyMuteList':
        this.subscribeMyMuteList();
        break;
      case 'subscribeMyAuthoredGroups':
        this.subscribeMyAuthoredGroups();
        break;
      case 'subscribeActiveCalls':
        this.subscribeActiveCalls();
        break;
    }
  }

  /**
   * P0 whitelist preflight — fires a tight kind:0 `authors:[me]` REQ on the
   * active relay so an `auth-required:` or `restricted:` rejection downgrades
   * `relayAccess` within ~1.5s, well before the rest of the fan-out hits
   * the 4s deferred soak. EOSE on this filter is harmless (the relay
   * just doesn't have my kind:0 yet) and still flips `relayAccess` to
   * 'ok' through the standard onevent/oneose path.
   *
   * `maxAttempts: 1` so a rejection doesn't trigger exponential-backoff
   * retries that would extend the perceived rejection window.
   */
  private preflightRelayAccess(): void {
    if (!this.session) return;
    const filter: Filter = {
      kinds: [KIND_USER_METADATA],
      authors: [this.session.pubKeyHex],
      limit: 1,
    };
    const sub = this.subscribeWatched(
      this.relays,
      filter,
      (ev) => this.ingestUserMetadata(ev),
      undefined,
      {
        watchdogMs: 1500,
        maxAttempts: 1,
        affectsRelayAccess: true,
        immediateAccessDowngrade: true,
      },
    );
    this.subs.push(sub);
  }

  /**
   * Reapply the per-group REQs captured by {@link resetPoolForSessionChange}.
   * The active group is bumped to the head of the messages list so that —
   * after a relay or session swap — the channel currently in view gets the
   * relay's first per-group response. No-op when there is no pending state.
   */
  private applyPendingResubscribe(
    pending: { messages: string[]; reactions: string[]; adminMember: string[]; metadata: string[] } | null,
  ): void {
    if (!pending) return;
    const messages = [...pending.messages];
    if (this.activeGroupId) {
      const idx = messages.indexOf(this.activeGroupId);
      if (idx > 0) {
        messages.splice(idx, 1);
        messages.unshift(this.activeGroupId);
      }
    }
    messages.forEach((id) => this.subscribeGroupMessages(id));
    pending.reactions.forEach((id) => this.subscribeGroupReactions(id));
    pending.adminMember.forEach((id) => this.subscribeAdminMember(id));
    pending.metadata.forEach((pk) => this.ensureUserMetadata(pk));
  }

  private subscribeGroupMetadata(): void {
    const filter: Filter = { kinds: [KIND_GROUP_METADATA] };
    const sub = this.subscribeWatched(
      this.relays,
      filter,
      (ev) => this.ingestGroupMetadata(ev),
      () => this.groupMetadataEose.set(true),
    );
    this.subs.push(sub);
  }

  /**
   * Single relay-wide subscription for kinds 39001 (admins) and 39002
   * (members) with no `#d` filter. Replaces the per-group fan-out that
   * `ingestGroupMetadata` used to do on every kind 39000 — one REQ
   * instead of N. Used to bootstrap the channel-layout author set so
   * operator-or-admin-authored layouts paint without waiting for the
   * user to open every channel. The lazy per-group REQ on
   * useAdmins/useMembers still runs, and is idempotent.
   */
  private subscribeAllAdminMember(): void {
    const filter: Filter = { kinds: [KIND_GROUP_ADMINS, KIND_GROUP_MEMBERS] };
    const sub = this.subscribeWatched(
      this.relays,
      filter,
      (ev) => this.ingestAdminMember(ev),
      undefined,
      { affectsRelayAccess: false },
    );
    this.subs.push(sub);
  }

  /**
   * Background entry-point used by {@link ingestGroupMetadata} for groups
   * the user has *not* explicitly opened. Defers the kind 9 REQ to a small
   * batch processed off-tick so the channel currently in view gets the
   * relay's first response. Already-subscribed and currently-active groups
   * are no-ops here — they're handled by direct {@link subscribeGroupMessages}
   * calls.
   */
  private queueGroupMessages(groupId: string): void {
    if (this.messageSubscribedGroups.has(groupId)) return;
    if (this.pendingMessageSet.has(groupId)) return;
    if (groupId === this.activeGroupId) {
      // The active group always gets its REQ immediately, even if metadata
      // arrived later than the user's click — this is the whole point of
      // the queue.
      this.subscribeGroupMessages(groupId);
      return;
    }
    this.pendingMessageSet.add(groupId);
    this.pendingMessageQueue.push(groupId);
    this.scheduleMessageQueueDrain();
  }

  private scheduleMessageQueueDrain(): void {
    if (this.pendingMessageTimer) return;
    // Strict active-channel priority: while the watched channel's kind 9
    // sub is still in `loading` (no EOSE, no events), hold all background
    // REQs back. The active sub's own EOSE / first-event handler calls
    // {@link maybeResumeMessageQueueDrain} to release the queue. Without
    // this gate, the relay's response queue interleaves the active
    // channel's history with N background channels' histories — making
    // the user wait visibly while watching one channel that already has
    // the data in flight.
    if (this.isActiveGroupStillLoading()) return;
    // Small delay so the active group's REQ (fired synchronously when the
    // user clicks a channel) lands before the relay sees a flood of
    // background REQs. Longer than a microtask so React's render commit
    // can settle first; short enough that background unread badges still
    // populate within ~1s on a heavy relay.
    this.pendingMessageTimer = setTimeout(() => {
      this.pendingMessageTimer = null;
      this.drainMessageQueue();
    }, 80);
  }

  /**
   * Re-arm the background drain when the active channel transitions out
   * of `loading` (its EOSE arrived, or its first event was ingested).
   * No-op if the queue is empty or the active channel is still loading.
   */
  private maybeResumeMessageQueueDrain(): void {
    if (this.pendingMessageQueue.length === 0) return;
    if (this.isActiveGroupStillLoading()) return;
    this.scheduleMessageQueueDrain();
  }

  /**
   * True iff the user is watching a channel whose kind 9 stream has not
   * yet produced either an EOSE or a message. Used to gate background
   * REQs so the watched channel always gets the relay's first attention.
   */
  private isActiveGroupStillLoading(): boolean {
    const id = this.activeGroupId;
    if (!id) return false;
    const status = this.messagesStatusByGroup.get()[id];
    return !status || status === 'loading';
  }

  private drainMessageQueue(): void {
    // Race guard: the active group's status may have flipped back to
    // 'loading' while the 80ms drain timer was pending (e.g. user clicked
    // a new channel just before the timer fired). Bail in that case;
    // {@link maybeResumeMessageQueueDrain} will pick up when the new
    // active channel's EOSE / first event lands.
    if (this.isActiveGroupStillLoading()) return;
    // Always promote the active group to the head of the queue if it
    // happens to be sitting in there — handles the case where the user
    // switched channels while a background batch was in flight.
    if (this.activeGroupId && this.pendingMessageSet.has(this.activeGroupId)) {
      this.pendingMessageSet.delete(this.activeGroupId);
      this.pendingMessageQueue = this.pendingMessageQueue.filter((id) => id !== this.activeGroupId);
      if (!this.messageSubscribedGroups.has(this.activeGroupId)) {
        this.subscribeGroupMessages(this.activeGroupId);
      }
    }
    const BATCH = 4;
    let processed = 0;
    while (this.pendingMessageQueue.length > 0 && processed < BATCH) {
      const id = this.pendingMessageQueue.shift()!;
      this.pendingMessageSet.delete(id);
      if (!this.messageSubscribedGroups.has(id)) {
        this.subscribeGroupMessages(id);
        processed++;
      }
    }
    if (this.pendingMessageQueue.length > 0) {
      this.scheduleMessageQueueDrain();
    }
  }

  /**
   * Move `groupId` to the head of the pending message queue (or fire its
   * REQ immediately if it isn't queued yet). Called by {@link setActiveGroup}
   * when the user clicks a channel — it ensures the channel currently in
   * view always wins the relay's attention, even if hundreds of other
   * groups are queued ahead of it from the kind 39000 fan-out.
   */
  private bumpGroupMessagesPriority(groupId: string): void {
    if (this.messageSubscribedGroups.has(groupId)) return;
    if (this.pendingMessageSet.has(groupId)) {
      this.pendingMessageSet.delete(groupId);
      this.pendingMessageQueue = this.pendingMessageQueue.filter((id) => id !== groupId);
    }
    this.subscribeGroupMessages(groupId);
  }

  private subscribeGroupMessages(groupId: string): void {
    if (this.messageSubscribedGroups.has(groupId)) return;
    this.messageSubscribedGroups.add(groupId);
    // A fresh REQ has not yet seen EOSE — make sure the flag reflects that
    // for callers that subscribed *before* a relay switch reused the same
    // bridge instance.
    if (this.messagesEoseByGroup.get()[groupId]) {
      this.messagesEoseByGroup.update((prev) => {
        if (!prev[groupId]) return prev;
        const { [groupId]: _drop, ...rest } = prev;
        void _drop;
        return rest;
      });
    }
    // Initial status: if the bridge already has cached messages for this
    // group (e.g. a returning subscriber after a relay switch), keep
    // 'has-messages'; otherwise enter 'loading' so the UI shows a spinner
    // until the bridge confirms emptiness or events arrive.
    const seedMsgs = this.messagesByGroup.get()[groupId] ?? [];
    this.setMessagesStatus(groupId, seedMsgs.length > 0 ? 'has-messages' : 'loading');
    const filter: Filter = {
      kinds: [KIND_GROUP_MESSAGE],
      '#h': [groupId],
      limit: BACKGROUND_MESSAGE_LIMIT,
    };
    const sub = this.subscribeWatched(
      this.relays,
      filter,
      (ev) => this.ingestMessage(groupId, ev),
      () => {
        // Flip per-group EOSE once the relay confirms it has finished
        // serving the stored history for this REQ. The chat pane reads
        // this for legacy purposes; the authoritative loading→empty
        // signal is now `messagesStatusByGroup`.
        this.messagesEoseByGroup.update((prev) =>
          prev[groupId] ? prev : { ...prev, [groupId]: true },
        );
        // Decide confidence: events already ingested? Trust the relay
        // and stop retrying. Empty? Drop to 'empty-unconfirmed' and let
        // the retry ladder run before the UI ever sees "No messages".
        const msgs = this.messagesByGroup.get()[groupId] ?? [];
        if (msgs.length > 0) {
          this.setMessagesStatus(groupId, 'has-messages');
          this.clearMessagesRetry(groupId);
        } else {
          this.setMessagesStatus(groupId, 'empty-unconfirmed');
          this.scheduleEmptyRetry(groupId);
        }
        // If this is the watched channel, release any background REQs we
        // were holding back to give it priority bandwidth.
        if (groupId === this.activeGroupId) this.maybeResumeMessageQueueDrain();
      },
      { affectsRelayAccess: false },
    );
    this.subs.push(sub);
    this.messageSubByGroup.set(groupId, sub);
  }

  /**
   * Write `status` to `messagesStatusByGroup[groupId]` only if it changed,
   * so React subscribers don't churn on redundant writes.
   */
  private setMessagesStatus(groupId: string, status: MessagesStatus): void {
    this.messagesStatusByGroup.update((prev) => {
      if (prev[groupId] === status) return prev;
      return { ...prev, [groupId]: status };
    });
  }

  /**
   * Drop any pending retry timer for `groupId`. Called when a message
   * arrives (we've proven the channel isn't empty), when the user logs
   * out / switches relay (the sub is going away), and when the retry
   * ladder is exhausted.
   */
  private clearMessagesRetry(groupId: string): void {
    const entry = this.messagesRetryByGroup.get(groupId);
    if (entry?.timer) clearTimeout(entry.timer);
    this.messagesRetryByGroup.delete(groupId);
  }

  /**
   * Drop every pending retry timer. Called on logout / pool reset /
   * relay switch — pending retries are tied to the old pool's filters.
   */
  private clearAllMessagesRetry(): void {
    for (const entry of this.messagesRetryByGroup.values()) {
      if (entry.timer) clearTimeout(entry.timer);
    }
    this.messagesRetryByGroup.clear();
  }

  /**
   * Empty-EOSE retry ladder. Auth-gated and silent-filtering relays
   * routinely send EOSE-empty fast (before AUTH completes, or after a
   * NIP-29 ACL filter dropped every event). Without this, the UI flashes
   * "No messages yet" on a channel that genuinely has history.
   *
   * Each call advances the attempt counter. After
   * {@link EMPTY_RETRY_DELAYS}.length attempts the status is promoted to
   * `empty-confirmed`. If a message arrives at any point, the timer is
   * cancelled and status flips to `has-messages`.
   */
  private scheduleEmptyRetry(groupId: string): void {
    if (!this.session) return; // logged out — drop the work
    const prior = this.messagesRetryByGroup.get(groupId);
    const attempts = prior?.attempts ?? 0;
    if (attempts >= BridgeImpl.EMPTY_RETRY_DELAYS.length) {
      this.setMessagesStatus(groupId, 'empty-confirmed');
      this.clearMessagesRetry(groupId);
      return;
    }
    const delay = BridgeImpl.EMPTY_RETRY_DELAYS[attempts];
    if (prior?.timer) clearTimeout(prior.timer);
    const timer = setTimeout(() => {
      const entry = this.messagesRetryByGroup.get(groupId);
      if (!entry) return; // cleared by a concurrent message / logout
      entry.timer = null;
      entry.attempts += 1;
      this.messagesRetryByGroup.set(groupId, entry);
      // If a message arrived between scheduling and firing, the entry
      // would already be cleared by `clearMessagesRetry`. Guard anyway.
      const msgs = this.messagesByGroup.get()[groupId] ?? [];
      if (msgs.length > 0) {
        this.setMessagesStatus(groupId, 'has-messages');
        this.clearMessagesRetry(groupId);
        return;
      }
      // Restart the sub so the relay sees a fresh REQ — most likely to
      // unstick auth-gated relays whose AUTH handshake finished after
      // the initial EOSE-empty.
      this.internalRestartMessageSub(groupId);
    }, delay);
    this.messagesRetryByGroup.set(groupId, { attempts, timer });
  }

  /**
   * Close any existing kind 9 sub for `groupId` and open a fresh one.
   * Does NOT reset the retry counter — used by both the retry ladder
   * (continuing attempts) and {@link refreshGroupMessages} (which resets
   * the counter before calling this).
   */
  private internalRestartMessageSub(groupId: string): void {
    if (!this.session) return;
    const existing = this.messageSubByGroup.get(groupId);
    if (existing) {
      try {
        existing.markClosed?.();
        existing.close();
      } catch {
        // ignore — relay may already have torn the socket down
      }
      this.messageSubByGroup.delete(groupId);
      this.subs = this.subs.filter((s) => s !== existing);
    }
    this.messageSubscribedGroups.delete(groupId);
    // Reset EOSE so the chat pane returns to "Loading messages…" while we
    // wait for the relay to confirm the fresh REQ.
    this.messagesEoseByGroup.update((prev) => {
      if (!prev[groupId]) return prev;
      const { [groupId]: _drop, ...rest } = prev;
      void _drop;
      return rest;
    });
    this.setMessagesStatus(groupId, 'loading');
    this.subscribeGroupMessages(groupId);
  }

  /**
   * Force-restart the kind 9 subscription for `groupId` and reset the
   * empty-EOSE retry counter so the user gets a fresh budget of attempts.
   * Use when an external surface needs to recover a stale-empty channel
   * (e.g. a "Reload" button). The active-group switch path also calls
   * this implicitly via {@link setActiveGroup} when re-entering an
   * empty-confirmed channel.
   */
  refreshGroupMessages(groupId: string): void {
    if (!groupId) return;
    this.clearMessagesRetry(groupId);
    this.internalRestartMessageSub(groupId);
  }

  private subscribeKind0(pubkey: string): void {
    const filter: Filter = { kinds: [KIND_USER_METADATA], authors: [pubkey] };
    const relays = Array.from(new Set([...this.relays, ...PROFILE_RELAYS]));
    // Non-critical path: a missing kind:0 just shows the npub instead of a
    // display name. Tighter watchdog so we fail fast on cold profile relays.
    const sub = this.subscribeWatched(
      relays,
      filter,
      (ev) => this.ingestUserMetadata(ev),
      undefined,
      { watchdogMs: 3000, affectsRelayAccess: false },
    );
    this.subs.push(sub);
  }

  private subscribeGroupReactions(groupId: string): void {
    if (this.reactionSubscribedGroups.has(groupId)) return;
    this.reactionSubscribedGroups.add(groupId);
    const filter: Filter = { kinds: [KIND_REACTION], '#h': [groupId], limit: 500 };
    const sub = this.subscribeWatched(
      this.relays,
      filter,
      (ev) => this.ingestReaction(groupId, ev),
      undefined,
      { watchdogMs: 3000, affectsRelayAccess: false },
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
    const sub = this.subscribeWatched(
      this.relays,
      filter,
      (ev) => this.ingestAdminMember(ev),
      undefined,
      { affectsRelayAccess: false },
    );
    this.subs.push(sub);
  }

  /**
   * Subscribe to the kind 9007 (create-group) event for `groupId` so we know
   * who originally created the channel. The author of that event is the
   * canonical creator and is used by {@link claimCreatorAdmin} to decide
   * whether to publish a one-shot kind 9000 admin claim — without this, we
   * would have to either trust the relay to auto-promote (many don't) or
   * blindly publish a kind 9000 admin for every group on every login (the
   * exact spam this refactor exists to eliminate).
   */
  private subscribeGroupCreator(groupId: string): void {
    if (this.creatorSubscribedGroups.has(groupId)) return;
    this.creatorSubscribedGroups.add(groupId);
    const filter: Filter = { kinds: [KIND_GROUP_CREATE], '#h': [groupId], limit: 1 };
    const sub = this.subscribeWatched(
      this.relays,
      filter,
      (ev) => this.ingestGroupCreator(ev),
      undefined,
      { affectsRelayAccess: false },
    );
    this.subs.push(sub);
  }

  /**
   * Single-REQ pull of every kind 9007 the local user has signed on this
   * relay. Per-group subs cover the general case but rate-limit-shaped
   * relays sometimes drop the burst of 1k+ per-group filters at once,
   * leaving the user's own channels without a known creator. This
   * authors-scoped filter is one REQ regardless of group count and
   * populates `groupCreators` for every group the user actually created
   * — the load-bearing input for the WoT rail's "show my own channels"
   * exemption.
   */
  private subscribeMyAuthoredGroups(): void {
    if (!this.session) return;
    const filter: Filter = { kinds: [KIND_GROUP_CREATE], authors: [this.session.pubKeyHex] };
    const sub = this.subscribeWatched(this.relays, filter, (ev) => this.ingestGroupCreator(ev));
    this.subs.push(sub);
  }

  private ingestGroupCreator(ev: NostrEvent): void {
    const groupId = ev.tags.find((t) => t[0] === 'h')?.[1];
    if (!groupId) return;
    // Newest-wins isn't meaningful for kind 9007 (a group is created exactly
    // once), but we still guard against mid-flight duplicates so we don't
    // thrash the store.
    const prev = this.groupCreators.get()[groupId];
    if (prev === ev.pubkey) return;
    this.groupCreators.update((m) => ({ ...m, [groupId]: ev.pubkey }));
    cacheSet(this.currentRelayUrl.get(), KIND_GROUP_CREATE, groupId, ev.pubkey);
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

  private subscribeMyMuteList(): void {
    if (!this.session) return;
    const filter: Filter = { kinds: [KIND_MUTE_LIST], authors: [this.session.pubKeyHex], limit: 1 };
    // Like kind 3, the mute list is typically published to general-purpose
    // relays rather than the dex's NIP-29 relay — widen the search so we
    // don't miss it.
    const relays = Array.from(new Set([...this.relays, ...PROFILE_RELAYS]));
    let latestCreatedAt = 0;
    const sub = this.subscribeWatched(relays, filter, (ev) => {
      if (ev.created_at <= latestCreatedAt) return;
      latestCreatedAt = ev.created_at;
      const pubkeys = ev.tags.filter((t) => t[0] === 'p' && typeof t[1] === 'string').map((t) => t[1]);
      this.myMutes.set(pubkeys);
    });
    this.subs.push(sub);
  }

  /**
   * Global subscription to kind 31314 (Obelisk SFU active-call announcement).
   * The SFU emits one per live room, replaceable on `d=<channelId>`. We track
   * them in `activeCallByChannel` so the sidebar can flag voice channels
   * that have a call in progress without anyone needing to be in it.
   *
   * `affectsRelayAccess: false` because absence of 31314 events is normal
   * (a relay might serve groups but not host any active SFU calls) and a
   * CLOSED for this filter shouldn't flip the relay-wide banner.
   */
  private subscribeActiveCalls(): void {
    const filter: Filter = { kinds: [KIND_SFU_ACTIVE_CALL] };
    const sub = this.subscribeWatched(
      this.relays,
      filter,
      (ev) => this.ingestActiveCall(ev),
      undefined,
      { affectsRelayAccess: false },
    );
    this.subs.push(sub);
  }

  private ingestActiveCall(ev: NostrEvent): void {
    const tag = (name: string) => ev.tags.find((t) => t[0] === name)?.[1];
    const channelId = tag('d');
    if (!channelId) return;
    const status = tag('status') ?? 'active';
    const hostPubkey = tag('host') ?? ev.pubkey;
    const expirationStr = tag('expiration');
    const expiresAt = expirationStr ? parseInt(expirationStr, 10) || 0 : 0;
    // Participant count: SFU started tagging this so consumers can
    // distinguish "live call with people" from "room still open during
    // empty-grace." Older SFU builds don't tag — treat absent as -1
    // (unknown, render badge to preserve back-compat) so we don't go
    // silent on a partial deploy.
    const countStr = tag('count');
    const participantCount = countStr === undefined ? -1 : (parseInt(countStr, 10) || 0);
    const cur = this.activeCallByChannel.get();
    const prev = cur[channelId];
    // Newest-wins: replaceable kind, stale duplicates from slow relays
    // shouldn't overwrite a fresher announcement.
    if (prev && prev.createdAt >= ev.created_at) return;
    if (status === 'closed') {
      if (!prev) return;
      const next = { ...cur };
      delete next[channelId];
      this.activeCallByChannel.set(next);
      return;
    }
    this.activeCallByChannel.set({
      ...cur,
      [channelId]: { hostPubkey, status, participantCount, expiresAt, createdAt: ev.created_at },
    });
  }

  /** Subscribe to the active-call state for any channel. */
  subscribeActiveCallByChannel(
    cb: (byChannel: Readonly<Record<string, { hostPubkey: string; status: string; participantCount: number; expiresAt: number; createdAt: number }>>) => void,
  ): Unsubscribe {
    return this.activeCallByChannel.subscribe(cb);
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
    // Drop older revisions arriving out-of-order from slower relays so the
    // sidebar doesn't oscillate. The cached seed (with its own created_at)
    // also participates in this guard.
    const prevAt = this.groupMetadataLatestAt.get(groupId) ?? 0;
    if (ev.created_at <= prevAt) return;
    this.groupMetadataLatestAt.set(groupId, ev.created_at);
    const isPublic = ev.tags.some((t) => t[0] === 'public');
    const isOpen = ev.tags.some((t) => t[0] === 'open');
    const parent = tag('parent') ?? null;
    // `["t","voice"]` / `["t","voice-sfu"]` / `["t","forum"]` are the
    // Obelisk channel-variant markers. Everything else defaults to `text`
    // so existing groups keep working unchanged. `voice-sfu` is checked
    // before `voice` because it's the more specific marker — a channel
    // tagged with both is "big-room voice".
    const isVoiceSfu = ev.tags.some((t) => t[0] === 't' && t[1] === 'voice-sfu');
    const isVoice = !isVoiceSfu && ev.tags.some((t) => t[0] === 't' && t[1] === 'voice');
    const isForum = !isVoiceSfu && !isVoice && ev.tags.some((t) => t[0] === 't' && t[1] === 'forum');
    // `["forum-tag", id, name, emoji?]` — admin-curated tag definitions on a
    // forum container. The `id` is opaque and stable; threads under the forum
    // reference it via their own `["topic", id]` tags. Skipping malformed
    // entries (missing id/name) keeps a typo-publish from blowing up the chip
    // bar. De-duped on id, last entry wins.
    const forumTagMap = new Map<string, JsForumTag>();
    for (const t of ev.tags) {
      if (t[0] !== 'forum-tag') continue;
      const id = t[1];
      const name = t[2];
      if (!id || !name) continue;
      const emoji = t[3] && t[3].length > 0 ? t[3] : null;
      forumTagMap.set(id, { id, name, emoji });
    }
    const forumTags: ReadonlyArray<JsForumTag> = Array.from(forumTagMap.values());
    // `["topic", id]` on a thread's metadata references a forum-tag id on
    // its parent forum container. We surface raw ids here; the UI resolves
    // them against the parent's `forumTags`.
    const topicSet = new Set<string>();
    for (const t of ev.tags) {
      if (t[0] === 'topic' && t[1]) topicSet.add(t[1]);
    }
    const topics: ReadonlyArray<string> = Array.from(topicSet);
    const next: JsGroup = {
      id: groupId,
      name: tag('name') ?? null,
      about: tag('about') ?? null,
      picture: tag('picture') ?? null,
      banner: tag('banner') ?? null,
      isPublic,
      isOpen,
      parent,
      kind: isVoiceSfu ? 'voice-sfu' : isVoice ? 'voice' : isForum ? 'forum' : 'text',
      forumTags,
      topics,
    };
    this.groups.update((prev) => {
      const filtered = prev.filter((g) => g.id !== groupId);
      return [...filtered, next].sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
    });
    // Persist for next reload — the sidebar paints channels instantly before
    // the live REQ round-trip completes. Store the snapshot together with
    // its created_at so the seed can re-establish the newest-wins guard.
    cacheSet(this.currentRelayUrl.get(), KIND_GROUP_METADATA, groupId, {
      group: next,
      createdAt: ev.created_at,
    });
    // Start streaming messages immediately so opening the channel doesn't
    // wait on a fresh REQ round-trip — the store already has them. The
    // per-group REQ caps at BACKGROUND_MESSAGE_LIMIT; older history is
    // paged via loadMoreMessages. Queued (rather than fired inline) so
    // the channel the user is actively viewing wins the relay's first
    // response — see {@link queueGroupMessages}.
    this.queueGroupMessages(groupId);
    // Admin/member (39001/39002) is intentionally NOT fanned out here.
    // Subscribing to every discovered group on login was expensive on
    // accounts that belong to many channels and slowed setup of recently
    // created groups (the user wants those to feel instant). Per-group
    // admin/member REQs now open lazily on first useAdmins / useMembers
    // call from the chat panel. Tradeoff: the sidebar's "I'm an admin of
    // X" badge no longer paints before opening each channel — acceptable
    // given the load-time win. See docs/data-system.md.
    // Resolve the kind 9007 author so claimCreatorAdmin knows whether the
    // local user is the creator without having to assume it on every login.
    this.subscribeGroupCreator(groupId);
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
    const mentions = extractMentionPubkeysFromMessage(ev.content, ev.tags);
    const msg: JsMessage = {
      id: ev.id,
      pubkey: ev.pubkey,
      content: ev.content,
      createdAt: ev.created_at,
      kind: ev.kind,
      replyToId: replyTo,
      mentions,
    };
    let isNew = false;
    let replacedClientTag: string | null = null;
    this.messagesByGroup.update((prev) => {
      const existing = prev[groupId] ?? [];
      if (existing.some((m) => m.id === msg.id)) return prev;
      // Relay echo of an optimistic placeholder we sent — replace in place
      // so the bubble's React key (msg.id) only changes once. Match on the
      // tuple we control end-to-end (pubkey, content, created_at) since the
      // pre-sign placeholder doesn't have an id yet.
      const pendingIdx = existing.findIndex(
        (m) =>
          m.pending === true
          && m.pubkey === msg.pubkey
          && m.content === msg.content
          && m.createdAt === msg.createdAt,
      );
      if (pendingIdx >= 0) {
        replacedClientTag = existing[pendingIdx].clientTag ?? null;
        const next = [...existing];
        next[pendingIdx] = msg;
        next.sort((a, b) => a.createdAt - b.createdAt);
        isNew = true;
        return { ...prev, [groupId]: next };
      }
      isNew = true;
      const next = [...existing, msg].sort((a, b) => a.createdAt - b.createdAt);
      return { ...prev, [groupId]: next };
    });
    if (replacedClientTag) this.pendingGroupSends.delete(replacedClientTag);
    // Lazy metadata fetch for any author we haven't seen yet.
    this.ensureUserMetadata(ev.pubkey);
    // A real event arrived: the channel is definitively non-empty. Cancel
    // any pending empty-EOSE retry and flip status. Doing this here
    // (rather than only in the EOSE callback) covers the case where
    // events arrive AFTER an empty EOSE but BEFORE the retry timer fires
    // — without it the bridge would still schedule a needless restart.
    if (isNew) {
      this.setMessagesStatus(groupId, 'has-messages');
      this.clearMessagesRetry(groupId);
      if (groupId === this.activeGroupId) this.maybeResumeMessageQueueDrain();
    }
    // Inbox card for @-mentions. Unread badges are derived in the UI from
    // `useReadStateStore.groupCursors[groupId]` vs `messages[].createdAt`,
    // so this path only needs to surface the mention as an inbox event
    // (the bell / mobile inbox UI). Historical backfill is filtered by the
    // user's existing inbox cursor — a cached event older than
    // `inboxLastReadAt` is read by definition.
    if (!isNew) return;
    const me = this.session?.pubKeyHex ?? null;
    if (!me || ev.pubkey === me) return;
    if (isUserWatchingChannel(groupId)) return;
    const mentioned = mentions.includes(me);
    // Reply-to-me detection: NIP-10 strict — `["e", id, "", "reply"]` whose
    // parent is one of MY messages in this channel. Resolved against the
    // already-ingested message list so we only fire when we can prove
    // authorship; backfill that arrives before the parent gets dropped.
    const replyToMe = (() => {
      if (!replyTo) return false;
      const list = this.messagesByGroup.get()[groupId] ?? [];
      const parent = list.find((m) => m.id === replyTo);
      return !!parent && parent.pubkey === me;
    })();
    if (!mentioned && !replyToMe) return;
    const evMs = ev.created_at * 1000;
    if (evMs <= useReadStateStore.getState().inboxLastReadAt) return;
    useReadStateStore.getState().pushInboxEvent({
      // Mentions take precedence over replies in the inbox card type — if
      // a message is both, surfacing it as a "mention" matches user
      // intent (the @ was the explicit ping).
      type: mentioned ? 'mention' : 'reply',
      channelId: groupId,
      messageId: ev.id,
      senderPubkey: ev.pubkey,
      preview: ev.content.slice(0, 280),
      createdAt: new Date(evMs).toISOString(),
    });
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
    let isNew = false;
    let replacedClientTag: string | null = null;
    this.dmsByPeer.update((all) => {
      const existing = all[counterparty] ?? [];
      if (existing.some((m) => m.id === dm.id)) return all;
      if (outgoing) {
        // See `ingestMessage` for the rationale — replace our own optimistic
        // placeholder in place rather than appending the relay-echoed copy
        // alongside it.
        const pendingIdx = existing.findIndex(
          (m) =>
            m.pending === true
            && m.outgoing === true
            && m.content === plaintext
            && m.createdAt === dm.createdAt,
        );
        if (pendingIdx >= 0) {
          replacedClientTag = existing[pendingIdx].clientTag ?? null;
          const next = [...existing];
          next[pendingIdx] = dm;
          next.sort((a, b) => a.createdAt - b.createdAt);
          isNew = true;
          return { ...all, [counterparty]: next };
        }
      }
      isNew = true;
      return {
        ...all,
        [counterparty]: [...existing, dm].sort((a, b) => a.createdAt - b.createdAt),
      };
    });
    if (replacedClientTag) this.pendingDMSends.delete(replacedClientTag);
    this.ensureUserMetadata(counterparty);
    // Inbox card for incoming DMs the user isn't actively watching. Unread
    // badges are derived from the read-state cursor + bridge `dmsByPeer`, so
    // we don't bump any counter here — only push a card for the bell/inbox.
    if (!isNew || outgoing) return;
    if (isUserWatchingDM(counterparty)) return;
    const evMs = ev.created_at * 1000;
    if (evMs <= useReadStateStore.getState().inboxLastReadAt) return;
    useReadStateStore.getState().pushInboxEvent({
      type: 'dm',
      senderPubkey: counterparty,
      preview: plaintext.slice(0, 280),
      createdAt: new Date(evMs).toISOString(),
    });
  }

  /**
   * Build a {@link NipSigner} backed by the active session — sign + NIP-44
   * encrypt/decrypt routed through whichever login method the user picked.
   * Used by the read-state relay-sync engine to NIP-59 gift-wrap state
   * events. Returns `null` when there is no active session.
   *
   * Bunker NIP-44 round-trips can be slow (the remote signer signs and
   * encrypts on every call); callers should debounce publish bursts.
   */
  getNipSigner(): NipSigner | null {
    if (!this.session) return null;
    const session = this.session;
    const pubkey = session.pubKeyHex;
    return {
      pubkey,
      signEvent: async (template) => {
        if (session.loginMethod === 'nsec' && session.privKeyHex) {
          const sk = hexToBytes(session.privKeyHex);
          return finalizeEvent({ ...template }, sk);
        }
        if (session.loginMethod === 'nip07') {
          const w = (window as unknown as { nostr?: { signEvent: (e: unknown) => Promise<NostrEvent> } }).nostr;
          if (!w) throw new Error('NIP-07 extension unavailable');
          return w.signEvent({ ...template, pubkey });
        }
        if (session.loginMethod === 'bunker') {
          const b = await this.ensureBunkerSigner();
          return b.signEvent(template) as Promise<NostrEvent>;
        }
        throw new Error(`Cannot sign with login method ${session.loginMethod}`);
      },
      nip44Encrypt: async (recipientPubkey, plaintext) => {
        if (session.loginMethod === 'nsec' && session.privKeyHex) {
          const sk = hexToBytes(session.privKeyHex);
          const key = nip44.utils.getConversationKey(sk, recipientPubkey);
          return nip44.encrypt(plaintext, key);
        }
        if (session.loginMethod === 'nip07') {
          const w = (window as unknown as {
            nostr?: { nip44?: { encrypt: (p: string, t: string) => Promise<string> } };
          }).nostr;
          if (!w?.nip44?.encrypt) throw new Error('Extension does not support NIP-44 encryption');
          return w.nip44.encrypt(recipientPubkey, plaintext);
        }
        if (session.loginMethod === 'bunker') {
          const b = await this.ensureBunkerSigner();
          return b.nip44Encrypt(recipientPubkey, plaintext);
        }
        throw new Error(`Cannot NIP-44 encrypt with login method ${session.loginMethod}`);
      },
      nip44Decrypt: async (senderPubkey, ciphertext) => {
        if (session.loginMethod === 'nsec' && session.privKeyHex) {
          const sk = hexToBytes(session.privKeyHex);
          const key = nip44.utils.getConversationKey(sk, senderPubkey);
          return nip44.decrypt(ciphertext, key);
        }
        if (session.loginMethod === 'nip07') {
          const w = (window as unknown as {
            nostr?: { nip44?: { decrypt: (p: string, c: string) => Promise<string> } };
          }).nostr;
          if (!w?.nip44?.decrypt) throw new Error('Extension does not support NIP-44 decryption');
          return w.nip44.decrypt(senderPubkey, ciphertext);
        }
        if (session.loginMethod === 'bunker') {
          const b = await this.ensureBunkerSigner();
          return b.nip44Decrypt(senderPubkey, ciphertext);
        }
        throw new Error(`Cannot NIP-44 decrypt with login method ${session.loginMethod}`);
      },
    };
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
    const prevAt = this.userMetadataLatestAt.get(ev.pubkey) ?? 0;
    if (ev.created_at <= prevAt) return;
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
      this.userMetadataLatestAt.set(ev.pubkey, ev.created_at);
      cacheSet(this.currentRelayUrl.get(), KIND_USER_METADATA, ev.pubkey, {
        meta,
        createdAt: ev.created_at,
      });
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
    const read = event ? parseRelayListMeta(event).read.filter(isImportableRelayUrl) : [];
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
        read.forEach((u) => { if (isImportableRelayUrl(u)) out.add(u); });
        write.forEach((u) => { if (isImportableRelayUrl(u)) out.add(u); });
      }
      const inbox = newest.get(10050);
      if (inbox) parseInboxRelays(inbox).forEach((u) => { if (isImportableRelayUrl(u)) out.add(u); });
    } catch {
      // best-effort — fall through to whatever we have
    }
    return Array.from(out);
  }

  private async signAndPublish(
    template: { kind: number; content: string; tags: string[][]; created_at: number },
    relayOpts: PublishOpts | readonly string[] = {},
    opts?: { quiet?: boolean },
  ): Promise<NostrEvent> {
    // Two call shapes: legacy `string[]` (merge with this.relays) and the new
    // `{ extraRelays, mode }` opts. Internal callers in this file still pass
    // arrays — translate here so the publish path below has one shape.
    const normalized: PublishOpts = Array.isArray(relayOpts)
      ? { extraRelays: relayOpts }
      : (relayOpts as PublishOpts);
    const extraRelays = normalized.extraRelays ?? [];
    const mode = normalized.mode ?? 'merge';
    if (!this.session) throw new Error('Not logged in');

    const signLabel =
      this.session.loginMethod === 'nip07'
        ? 'Waiting for extension signature'
        : this.session.loginMethod === 'bunker'
          ? 'Waiting for bunker signature'
          : 'Signing event';
    // `quiet`: best-effort background publish (e.g. lazy member self-add).
    // Suppress the activity-bar lifecycle so the user doesn't see a
    // Publishing/Failed toast for a write the relay routinely declines.
    const signId = opts?.quiet ? null : pushActivity(signLabel, `kind ${template.kind}`);
    let event: NostrEvent;
    try {
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
      if (signId != null) resolveActivity(signId);
    } catch (e) {
      if (signId != null) failActivity(signId, e instanceof Error ? e.message : String(e));
      throw e;
    }

    const targetRelays = mode === 'replace'
      ? Array.from(new Set(extraRelays))
      : Array.from(new Set([...this.relays, ...extraRelays]));
    const pubId = opts?.quiet ? null : pushActivity('Publishing to relays', `kind ${template.kind} → ${targetRelays.length} relay(s)`);
    const publishes = this.pool.publish(targetRelays, event, { onauth: this.getAuthSigner() });

    // Ephemeral events (NIP-01: kinds 20000-29999) are not stored and some
    // relays don't even send OK for them — strfry/relay.obelisk.ar in
    // particular times out the publish promise instead of acknowledging.
    // The bytes are already on the wire by the time pool.publish returns;
    // waiting for OK just produces "publish time out" errors that mislead
    // users into thinking voice is broken. Treat these as fire-and-forget
    // and let any per-relay rejection surface as a console swallow.
    const isEphemeral = event.kind >= 20000 && event.kind < 30000;
    if (isEphemeral) {
      for (const p of publishes) {
        p.catch((e) => console.debug('[bridge] ephemeral publish skip', event.kind, e instanceof Error ? e.message : e));
      }
      if (pubId != null) resolveActivity(pubId, `ephemeral → ${targetRelays.length} relay(s)`);
      return event;
    }

    const results = await Promise.allSettled(publishes);
    // Surface NIP-42 / whitelist signals from the active relay. We only flip
    // state on rejections — successful publishes already get marked 'ok' via
    // the read path's onevent/oneose, so no need to overwrite here.
    results.forEach((r, i) => {
      if (r.status !== 'rejected') return;
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
      const state = parseRelayRejection(reason);
      if (!state) return;
      // Same logic as the read-path onclose: auth/whitelist rejections during
      // a publish are usually transient (NIP-42 AUTH not yet completed for
      // the session, NIP-29 membership write race). Defer the banner flip so
      // the soak window can absorb the transient failure.
      if (state === 'auth-required' || state === 'restricted') {
        this.setRelayAccessDeferred(targetRelays[i], state);
      } else {
        this.setRelayAccess(targetRelays[i], state);
      }
    });
    let accepted = results.filter((r) => r.status === 'fulfilled');
    let finalResults = results;
    // First publish after a relay switch often times out because NIP-42 AUTH
    // hasn't completed yet — the AUTH challenge fires in parallel with the
    // EVENT and the publish promise loses the race. By the time the user
    // sees the timeout the socket is authed, so a single retry succeeds and
    // the user doesn't have to manually click Create again.
    const allTimedOut =
      accepted.length === 0 &&
      results.every((r) => {
        if (r.status === 'fulfilled') return false;
        const reason = (r.reason instanceof Error ? r.reason.message : String(r.reason)).toLowerCase();
        return reason.includes('time') && reason.includes('out');
      });
    if (allTimedOut) {
      const retry = this.pool.publish(targetRelays, event, { onauth: this.getAuthSigner() });
      finalResults = await Promise.allSettled(retry);
      finalResults.forEach((r, i) => {
        if (r.status !== 'rejected') return;
        const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
        const state = parseRelayRejection(reason);
        if (state) this.setRelayAccess(targetRelays[i], state);
      });
      accepted = finalResults.filter((r) => r.status === 'fulfilled');
    }
    if (accepted.length === 0) {
      const reasons = finalResults
        .map((r, i) => {
          if (r.status === 'fulfilled') return null;
          const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
          return `${targetRelays[i]}: ${reason}`;
        })
        .filter(Boolean)
        .join('; ');
      const msg = `Relay rejected event (kind ${event.kind}). ${reasons || 'no relay accepted'}`;
      if (pubId != null) failActivity(pubId, msg);
      throw new Error(msg);
    }
    if (pubId != null) resolveActivity(pubId, `accepted by ${accepted.length}/${targetRelays.length}`);
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
/**
 * Strict client-side filter for relay URLs imported from remote events
 * (NIP-65 kind 10002, NIP-17 kind 10050, etc.). The browser's CSP only
 * allows `wss:` in `connect-src`, and localhost/loopback URLs published
 * by some clients (Coracle / dev setups) trigger a noisy CSP violation
 * AND a `WebSocket connection failed` per page-load. Drop them at
 * ingestion so they never reach `new WebSocket()`.
 *
 * Rules:
 *   - Must parse as a URL.
 *   - Must use `wss:` scheme. Plain `ws:` is rejected — browsers refuse
 *     mixed-content WebSockets from an https origin anyway, and any
 *     `ws://` entry in a published relay list is almost certainly a
 *     leftover from a local-dev relay an upstream client forgot to
 *     scrub before broadcasting.
 *   - Hostname can't be `localhost`, `*.localhost`, `*.local`, or an
 *     IPv4 literal in the loopback / RFC-1918 / link-local ranges.
 */
export function isImportableRelayUrl(url: string): boolean {
  let p: URL;
  try { p = new URL(url); } catch { return false; }
  if (p.protocol !== 'wss:') return false;
  const host = p.hostname.toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  // IPv4 ranges that have no business in a relay list.
  if (/^127\./.test(host)) return false;
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return false;
  if (host === '0.0.0.0') return false;
  // IPv6 loopback / link-local literals.
  if (host === '::1' || host === '[::1]') return false;
  if (host.startsWith('fe80:')) return false;
  return true;
}

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

function uniqueRelayUrls(urls: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of urls) {
    try {
      const normalized = normalizeRelayUrl(raw);
      validateRelayUrl(normalized);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    } catch {
      // Ignore corrupted persisted relay entries; users can re-add them.
    }
  }
  return out;
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

/**
 * Opaque client-side tag for an optimistic message placeholder. Lives in
 * the message's `clientTag` field and is mirrored as `pending:<tag>` in the
 * `id` field while the publish is in flight. 16 hex chars = 64 bits of
 * entropy — more than enough to avoid collisions across the few hundred
 * placeholders a session might accumulate.
 */
function generateClientTag(): string {
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
