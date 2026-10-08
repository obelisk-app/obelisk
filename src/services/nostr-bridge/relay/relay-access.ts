/**
 * The relay-access state machine: NIP-42 / whitelist verdicts for the relay
 * being browsed (`relayAccess`, a store the facade shares through the
 * context), the soak timers behind deferred downgrades, the "Authenticating
 * with {host}" activity entries, the AUTH-settled hook, `waitForRelayAuth`
 * and the whitelist preflight REQ. Pure move from `client.ts` (round 4
 * plan, step 11). This is the module the hub's status adapter feeds.
 */
import { shortHost } from '@/utils/relay-url/url-host';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { BoundedMap } from '@nostr-wot/relay/hub';
import { KIND_METADATA } from '@/constants/nostr/nip-kinds';
import { dismissActivity, failActivity, pushActivity, resolveActivity } from '@/services/feedback/activity-log';
import type { ActivityCode, ErrorCode, EventKindLabel } from '@/utils/errors/codes';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import type { BridgeContext, SetRelayAccessOpts, TrackedSub } from '../facade/context';
import type { RelayAccessState, Unsubscribe } from '../common/types';

// How long to wait before flipping the relay-access banner from 'unknown' to
// a non-ok state on retryable rejections (auth-required/restricted). The
// `subscribeWatched` retry path heals most NIP-42 AUTH races in <1s; a 4s
// soak hides the banner for those, while still surfacing genuinely persistent
// auth/whitelist problems within a few seconds.
const RELAY_ACCESS_SOAK_MS = 4000;

export type RelayAccessContext = Pick<
  BridgeContext,
  'session' | 'relays' | 'currentRelayUrl' | 'relayAccess' | 'subscribeWatched' | 'track' | 'closeTracked'
>;

export interface RelayAccessDeps {
  /** A DM relay the session holds a `'dm'` AUTH lease on also shows its access state (hub step 10 deletes this). */
  isDmLeasedRelay(url: string): boolean;
  /** AUTH on the active relay settled 'ok' for the first time: the messages module refreshes stuck channels. */
  onAuthOk(): void;
  /** AUTH on the active relay settled in a refusal: the messages module stops its empty-retry ladders. */
  onAccessFail(): void;
  /** The preflight REQ returns the session's own kind 0; the profiles module ingests it. */
  ingestOwnMetadata(ev: NostrEvent): void;
}

export class RelayAccessModule {
  /**
   * Per-relay timers for deferred relay-access downgrades. See
   * {@link setDeferred}. Cleared on session change.
   */
  private readonly deferredAccessDowngrades = new Map<string, ReturnType<typeof setTimeout>>();
  /**
   * Activity-log id of the persistent "Authenticating with {host}" entry
   * tied to a relay's `'authenticating'` access state. Created when the
   * relay first sends a NIP-42 AUTH challenge (seen through `hub.onStatus`),
   * resolved when access flips to `'ok'`, failed when it flips to
   * `'auth-required'` / `'restricted'` / `'error'`. Driven entirely from
   * inside {@link set} so any code path that mutates access state keeps the
   * bottom-right indicator in sync.
   */
  private readonly authActivityIds = new Map<string, number>();
  /**
   * The access verdict last seen per active relay, for the AUTH-settled
   * hook. LRU, 64 relays: the rail holds a handful, and a relay that fell
   * out only re-runs the hook's first-settle check once.
   */
  private readonly lastRelayAccessByUrl = new BoundedMap<string, RelayAccessState>({ maxEntries: 64, policy: 'lru' });

  constructor(
    private readonly ctx: RelayAccessContext,
    private readonly deps: RelayAccessDeps,
  ) {}

  /**
   * True if `url` is the relay the user is currently viewing (or a DM relay
   * the session answers AUTH on): the relays whose access state the banner
   * shows. nostr-tools may pass URLs with or without a trailing slash, so
   * compare normalized.
   */
  isActiveRelay(url: string): boolean {
    const target = normalizeRelayUrl(url);
    if (this.ctx.relays().some((r) => normalizeRelayUrl(r) === target)) return true;
    return this.deps.isDmLeasedRelay(target);
  }

  /**
   * Update the relay-access store for the active relay. No-op for any URL
   * that isn't the currently-opened relay: we only surface auth/whitelist
   * state for the relay the user is actually looking at.
   *
   * Sticky upgrade to 'ok' guards against transient AUTH refreshes (some
   * relays re-challenge mid-session): once the relay has confirmed it reads
   * us, we don't flip back to 'authenticating' for a refresh round-trip.
   *
   * Pass `{ override: true }` for explicit relay rejections (CLOSED with
   * `auth-required:` / `restricted:` reason, ensureRelay handshake failure,
   * or a socket drop). Those are authoritative about loss of access and must
   * be allowed to downgrade from 'ok'; otherwise the banner never surfaces
   * a relay that revoked us mid-session.
   */
  set(url: string, state: RelayAccessState, opts?: SetRelayAccessOpts): void {
    if (!this.isActiveRelay(url)) return;
    const key = normalizeRelayUrl(url);
    const cur = this.ctx.relayAccess.get();
    if (cur[key] === state) return;
    // Sticky-OK: once the relay has confirmed it reads us, never downgrade
    // back to a non-'ok' state. Per-channel CLOSED rejections (private
    // channels the user isn't a member of, NIP-29 publish races) are normal
    // mid-session noise: letting them flip the banner causes flashing.
    if (cur[key] === 'ok' && state !== 'ok' && !opts?.override) return;
    // 'restricted' is the relay saying "I know who you are, and no". A later
    // AUTH-flavoured signal can't make that less true: only a successful
    // read ('ok') or a relay/session change (which resets the map) clears it.
    if (cur[key] === 'restricted' && (state === 'auth-required' || state === 'authenticating')) return;
    // Nor can an EOSE. nostr-tools' pool fires a synthetic EOSE for every
    // relay-sent CLOSED (`handleClose` → `handleEose`, same tick, just before
    // `onclose`), so on a refusing relay each REQ reports EOSE→CLOSED: without
    // this, the next refused sub's EOSE flipped a 'restricted' verdict back
    // to 'ok' and the user saw "No channels found". Only a delivered EVENT is
    // proof the relay now serves us.
    if (cur[key] === 'restricted' && state === 'ok' && opts?.fromEose) return;
    // Any state transition supersedes a pending deferred downgrade: most
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
      const host = shortHost(url);
      // The host rides as the detail: the indicator reads it into the title.
      const id = pushActivity(
        'relayAuth' satisfies ActivityCode,
        host,
        { operation: 'sign', description: 'relayAuth' satisfies EventKindLabel },
      );
      this.authActivityIds.set(key, id);
    } else if (cur[key] === 'authenticating' && state !== 'authenticating') {
      const id = this.authActivityIds.get(key);
      if (id != null) {
        if (state === 'ok') {
          resolveActivity(id);
        } else if (state === 'auth-required') {
          failActivity(id, 'auth-refused' satisfies ErrorCode);
        } else if (state === 'restricted') {
          failActivity(id, 'not-whitelisted' satisfies ErrorCode);
        } else if (state === 'unreachable') {
          // Transient: the socket dropped mid-AUTH. The reconnect path
          // will fire a fresh AUTH activity if it actually re-authenticates.
          // Marking this one as failed surfaces a misleading "relay is
          // unreachable" toast even when the next round-trip succeeds.
          dismissActivity(id);
        } else if (state === 'error') {
          failActivity(id, 'relay-error' satisfies ErrorCode);
        } else {
          dismissActivity(id);
        }
        this.authActivityIds.delete(key);
      }
    }
    this.ctx.relayAccess.set({ ...cur, [key]: state });
  }

  /**
   * Schedule a downgrade to `state` after the soak window unless the relay
   * proves itself first. A pending window is never extended.
   */
  setDeferred(url: string, state: RelayAccessState): void {
    if (!this.isActiveRelay(url)) return;
    const key = normalizeRelayUrl(url);
    const cur = this.ctx.relayAccess.get();
    if (cur[key] === 'ok') return; // sticky-OK
    if (cur[key] === state) return;
    if (this.deferredAccessDowngrades.has(key)) return; // don't extend window
    const t = setTimeout(() => {
      this.deferredAccessDowngrades.delete(key);
      const now = this.ctx.relayAccess.get();
      if (now[key] === 'ok') return;
      if (now[key] === state) return;
      this.set(url, state);
    }, RELAY_ACCESS_SOAK_MS);
    this.deferredAccessDowngrades.set(key, t);
  }

  /** Called once from the facade's constructor. */
  wireAuthSettledHook(): void {
    this.ctx.relayAccess.subscribe((byRelay) => {
      const active = this.ctx.currentRelayUrl.get();
      const cur = byRelay[active];
      const prev = this.lastRelayAccessByUrl.get(active);
      this.lastRelayAccessByUrl.set(active, cur ?? 'unknown');
      // We only care about the *first* time AUTH leaves the in-flight
      // state for the active relay, i.e., transitions out of
      // 'unknown' / 'authenticating' / undefined. Transitions between
      // non-pending states (e.g., 'ok' → 'unreachable' on a socket
      // drop) are handled by the reconnect path elsewhere.
      const wasPending = prev === undefined || prev === 'unknown' || prev === 'authenticating';
      if (!wasPending) return;
      if (cur === 'unknown' || cur === 'authenticating' || cur === undefined) return;
      if (cur === 'ok') {
        // Happy path: AUTH succeeded. Refresh stuck channels so the
        // fresh kind 9 REQs ride the now-AUTH'd socket and deliver
        // history without the user manually reloading.
        this.deps.onAuthOk();
      } else {
        // A rejected or unreachable relay cannot prove that a channel is
        // empty. Stop retrying; the relay banner explains the failure.
        this.deps.onAccessFail();
      }
    });
  }

  /** Relays whose last verdict the AUTH-settled hook remembers; for the bound test. */
  rememberedVerdictCount(): number {
    return this.lastRelayAccessByUrl.size;
  }

  waitForAuth(timeoutMs: number): Promise<'ok' | 'timeout' | RelayAccessState> {
    return new Promise((resolve) => {
      const currentKey = () => normalizeRelayUrl(this.ctx.currentRelayUrl.get());
      const initial = this.ctx.relayAccess.get()[currentKey()];
      if (initial === 'ok') return resolve('ok');
      let unsub: Unsubscribe | null = null;
      const timer = setTimeout(() => {
        if (unsub) unsub();
        const cur = this.ctx.relayAccess.get()[currentKey()];
        resolve(cur === 'ok' ? 'ok' : (cur ?? 'timeout'));
      }, timeoutMs);
      unsub = this.ctx.relayAccess.subscribe((byRelay) => {
        const state = byRelay[currentKey()];
        if (state === 'ok') {
          clearTimeout(timer);
          if (unsub) unsub();
          resolve('ok');
        }
      });
    });
  }

  /**
   * Whitelist preflight: one bounded REQ for the session's own kind 0, with
   * an immediate access downgrade on refusal so a "Not whitelisted" banner
   * shows within ~1.5s. P0 of the fan-out.
   */
  preflight(): void {
    const session = this.ctx.session();
    if (!session) return;
    const filter: Filter = {
      kinds: [KIND_METADATA],
      authors: [session.pubKeyHex],
      limit: 1,
    };
    // `let`, not `const`: a pool can deliver `onevent` synchronously inside
    // `subscribeWatched` (the test fake does), before this declaration has
    // completed. `const` would make the `sub` read below a TDZ ReferenceError;
    // `let` leaves it undefined and the guard holds.
    let sub: TrackedSub | undefined;
    // eslint-disable-next-line prefer-const
    sub = this.ctx.subscribeWatched(
      this.ctx.relays(),
      filter,
      (ev) => {
        this.deps.ingestOwnMetadata(ev);
        if (sub) this.ctx.closeTracked(sub);
      },
      () => {
        // EOSE proves the relay accepted the query, but keep the preflight
        // handle alive until CLOSED/event so an immediate EOSE-then-CLOSED
        // auth-required can still downgrade relayAccess.
      },
      {
        watchdogMs: 1500,
        maxAttempts: 1,
        affectsRelayAccess: true,
        immediateAccessDowngrade: true,
      },
    );
    this.ctx.track(sub);
  }

  /**
   * Session or relay change: forget every verdict (the next REQ must re-prove
   * access), drop the pending downgrades, and dismiss (not fail) the stale
   * "Authenticating with {host}" entries so a legitimate reconnect never
   * flashes an error toast.
   */
  reset(): void {
    this.ctx.relayAccess.set({});
    for (const t of this.deferredAccessDowngrades.values()) clearTimeout(t);
    this.deferredAccessDowngrades.clear();
    for (const id of this.authActivityIds.values()) dismissActivity(id);
    this.authActivityIds.clear();
  }
}
