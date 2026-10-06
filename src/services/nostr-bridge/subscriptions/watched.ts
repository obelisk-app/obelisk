/**
 * The session's watched REQ (round 4 plan, `subscribeWatched`): one holder
 * on the hub's registry with the bridge-side reading of what comes back,
 * relay-access reporting from every EVENT, EOSE and CLOSED, the WoT gate on
 * the event path, and the quota hand-off to the caller. Pure move from
 * `client.ts`; `./registry.ts` is the only caller.
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import type { RelayHub, SubscriptionHandle } from '@/lib/relay-hub';
import { wotEngine } from '@/services/wot/engine';
import type { SetRelayAccessOpts, TrackedSub, WatchedSubOptions } from '../context';
import { pushRelayDebug } from '../relay-debug';
import { classifyAccessClose, isRelayQuotaOrRateLimit, isWhitelistRefusal } from '../relay-rejection';
import { normalizeRelayUrl } from '../relay-url';
import type { RelayAccessState } from '../types';

export interface WatchedReqDeps {
  readonly hub: Pick<RelayHub, 'subscribe'>;
  /** A logged-in session offers to identify: its leased sockets carry the signer. */
  signerOffered(): boolean;
  setRelayAccess(url: string, state: RelayAccessState, opts?: SetRelayAccessOpts): void;
  setRelayAccessDeferred(url: string, state: RelayAccessState): void;
}

/**
 * The session's watched REQ: `hub.subscribe` on the registry (round 2
 * design, step 7) with the bridge-side interpretation the design keeps
 * here: relay-access reporting from every EVENT, EOSE and CLOSED, the WoT
 * gate on the event path, and the quota hand-off to the caller. The
 * watchdog (`watchdogMs`, default 5 s: neither an EVENT nor an EOSE in
 * the window closes and re-issues the REQ with backoff, waiting out an
 * AUTH prompt in flight), the retry ladder (immediate once on
 * `auth-required:`, then 1 s doubling to 30 s), `maxAttempts` (default
 * unbounded), the dedupe of identical filters on one relay and the
 * re-issue on the next socket generation are all the registry's. Through
 * nostr-tools' pool a bare `auth-required:` reaching here means AUTH
 * succeeded and the relay still refused: `classifyAccessClose`.
 *
 * On a multi-relay REQ `oneose` fires once each time every relay has
 * answered (nostr-tools' pool semantics); a relay the hub gave up on
 * counts as answered.
 */
export function openWatchedReq(
  deps: WatchedReqDeps,
  relays: string[],
  filter: Filter,
  onevent: (ev: NostrEvent) => void,
  oneose?: () => void,
  options?: WatchedSubOptions,
): TrackedSub {
  // Per-channel / per-pubkey subs (group messages, admin/member, single
  // user metadata) get CLOSED for normal "you can't see this one" reasons:
  // private channels you aren't a member of, profile relays that don't
  // serve the queried pubkey. Those CLOSEDs must NOT flip the relay-wide
  // access banner; otherwise the user sees "Not whitelisted" even when
  // their global metadata sub is delivering everything fine.
  const AFFECTS_ACCESS = options?.affectsRelayAccess ?? true;
  const IMMEDIATE_ACCESS_DOWNGRADE = options?.immediateAccessDowngrade ?? false;
  // Whether this REQ offered to identify: a leased relay's socket carries
  // the session signer, and `classifyAccessClose` reads a CLOSED
  // differently on a REQ that could have AUTHed.
  const signerOffered = deps.signerOffered();
  const relayCount = new Set(relays.map(normalizeRelayUrl)).size;
  const answered = new Set<string>();
  let closed = false;
  let handle: SubscriptionHandle | null = null;
  let released = false;
  // The registry can report a verdict synchronously inside `subscribe`
  // (attaching to a REQ it already gave up on), before `handle` exists.
  const release = () => {
    released = true;
    handle?.release();
  };
  const relayAnswered = (url: string) => {
    answered.add(url);
    if (answered.size < relayCount) return;
    answered.clear();
    oneose?.();
  };
  pushRelayDebug({ kind: "sub-start", relays, filter, payload: { attempt: 1 } });
  handle = deps.hub.subscribe({
    relays,
    filters: [filter],
    priority: options?.priority ?? 'background',
    watchdogMs: options?.watchdogMs ?? 5000,
    maxAttempts: options?.maxAttempts,
    onEvent: (ev, url) => {
      if (closed) { pushRelayDebug({ kind: "sub-stale-event", relays, filter, eventKind: ev.kind }); return; }
      // Any event delivered means the relay is reading us: auth (if
      // required) succeeded and we're not whitelist-blocked. Mark the
      // active relay 'ok' (the setter no-ops for non-active relays).
      if (AFFECTS_ACCESS) deps.setRelayAccess(url, 'ok');
      // WoT / mute / block gate. The engine fails-open until a verdict
      // resolves; resolved-deny events are dropped here so they never
      // reach ingest, the cache, or `messagesByGroup`. When the engine
      // is disabled the predicate is a constant `true` and this is a
      // no-op. See docs/wot-integration-plan.md.
      if (!options?.bypassWot && !wotEngine.isAllowed(ev.pubkey, ev.kind)) return;
      pushRelayDebug({ kind: "sub-event", relays, filter, eventKind: ev.kind });
      onevent(ev);
    },
    onEose: (url) => {
      if (closed) { pushRelayDebug({ kind: "sub-stale-eose", relays, filter }); return; }
      pushRelayDebug({ kind: "sub-eose", relays, filter });
      // EOSE alone is not proof of success on auth-gated relays: they
      // routinely send an empty EOSE before CLOSED auth-required, which
      // is why `fromEose` cannot clear a 'restricted' verdict.
      if (AFFECTS_ACCESS) deps.setRelayAccess(url, 'ok', { fromEose: true });
      relayAnswered(url);
    },
    onRelayClosed: (url, reason) => {
      if (closed) return;
      pushRelayDebug({ kind: "sub-close", relays, filter, payload: { reasons: [reason] } });
      const state = classifyAccessClose(reason, signerOffered);
      // A relay-wide refusal: refused after a successful AUTH (see
      // classifyAccessClose), or an explicit `restricted:` naming the
      // whitelist. The relay's final answer, not an AUTH race, so no
      // soak, and it overrides sticky-OK: nostr-tools fires a synthetic
      // EOSE just before every relay CLOSED, so a refused sub has always
      // "confirmed" 'ok' a moment before it is refused.
      const refusedAfterAuth =
        (signerOffered && reason.startsWith('auth-required: ')) || isWhitelistRefusal(reason);
      if (state) {
        if (state === 'auth-required' || state === 'restricted') {
          // The retry is the registry's (immediate once, then backoff).
          // A per-channel CLOSED ("you can't read this one") still gets
          // it, but does NOT update the relay-wide banner.
          if (AFFECTS_ACCESS) {
            if (IMMEDIATE_ACCESS_DOWNGRADE || refusedAfterAuth) {
              deps.setRelayAccess(url, state, { override: true });
            } else {
              deps.setRelayAccessDeferred(url, state);
            }
          }
        } else if (AFFECTS_ACCESS) {
          deps.setRelayAccess(url, state);
        }
        return;
      }
      if (isRelayQuotaOrRateLimit(reason)) {
        // The relay cannot accept another live REQ from us; a retry from
        // every watched sub turns a full connection into a retry storm,
        // and voice signaling is usually the first thing starved. Release
        // here, which takes the REQ out of the hub's hands (no park, no
        // retry), and leave recovery to the caller.
        closed = true;
        release();
        options?.onQuotaOrRateLimitClose?.();
      }
      // Anything else: the registry retries with backoff, then gives up.
    },
    onClosed: (url, reason) => {
      if (closed) return;
      pushRelayDebug({ kind: "sub-close", relays, filter, payload: { reasons: [reason], terminal: true } });
      // The hub gave up on this relay (`maxAttempts`, a `restricted:`
      // verdict, a socket forgotten). The holder stays: on a multi-relay
      // REQ the other relays are still live, and on any REQ the caller
      // decides when to let go (a restart releases and re-subscribes).
      relayAnswered(url);
    },
  });
  if (released) handle.release();

  return {
    close: () => {
      if (closed) return;
      closed = true;
      release();
    },
    setPriority: (priority) => handle?.setPriority(priority),
  };
}
