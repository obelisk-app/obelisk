/**
 * Nostr transport for games - the direct analogue of
 * `src/services/voice/transport.ts`, and deliberately shaped like it: publish
 * through the bridge signer, subscribe with the WATCHED variant so a relay
 * blip doesn't silently kill the sub, and gate everything in the handler
 * rather than trusting the relay's tag indexing.
 *
 * Games follow the single-relay rule (CLAUDE.md): a table lives on the
 * channel's relay, because the channel does. Nothing here ever fans out
 * across the user's configured relays.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { KIND_GAME } from '@/utils/nip-kinds';
import {
  parseGameEvent,
  GAME_LOG_WINDOW_SECONDS,
  GAME_TAG,
  type GameEvent,
  type ParsedGameEvent,
} from '@/lib/games/protocol';
import { bridge, GAME_SUB_WATCHDOG_MS } from './transport-bridge';

export {
  findCreateByNonce,
  looksLikeLostConfirmation,
  publishAttack,
  publishCancel,
  publishCheckpoint,
  publishCreate,
  publishJoin,
  publishMove,
  publishResign,
  publishStart,
  publishTimeout,
  publishTopOut,
} from './transport-publish';

/**
 * Tables fetched per channel. The relay returns the NEWEST n, so on a busy
 * Stacker channel a `create` can fall off the end of this - which is only
 * acceptable because a card resolves itself by id (`./resolve.ts`). This REQ is
 * for what is live in the channel, not for making a specific card render. Don't
 * lower it without checking that dependency still holds.
 */
export const CHANNEL_GAME_LIMIT = 400;

/**
 * How long the tagged REQ is given to produce something before we go looking
 * for a reason it hasn't.
 */
export const TAG_PROBE_MS = 2500;

/**
 * Per relay: does it index single-letter tags for kind 2390? `true` once we
 * have proof, `false` once we have proof it doesn't. Absent means unknown.
 * Session-scoped - a relay's indexing does not change under us.
 */
const tagIndexOk = new Map<string, boolean>();

/** Test seam. */
export function __resetTagIndexProbe(): void {
  tagIndexOk.clear();
}

/**
 * Subscribe to every game event in a channel.
 *
 * This used to filter on kind + `since` alone and gate the `h` tag in the
 * handler, for a real reason: a relay that doesn't index `#h` for an unfamiliar
 * kind answers a tag-filtered REQ with silence, and that silence is
 * indistinguishable from "nobody is playing here". The cost was that opening
 * any channel downloaded every game event on the relay for 24 hours - mostly
 * Stacker checkpoints, which carry board and input blobs - and `JSON.parse`d
 * each one before finding out it belonged to somebody else.
 *
 * So: ask the narrow question, and when it comes back empty, ask a *different*
 * question to find out why.
 *
 *   1. `{ kinds, '#h': [channel], since, limit }` - the live sub.
 *   2. If it produces nothing within `TAG_PROBE_MS`, one-shot
 *      `{ kinds, '#t': [GAME_TAG], limit: 1 }`. Same kind, same class of
 *      single-letter indexed tag, no channel in it - so it answers exactly the
 *      question at issue. Every game event carries `['t', GAME_TAG]`.
 *      - It returns something → the relay does index these tags → the silent
 *        `#h` REQ meant what it said, and the broad filter is never opened.
 *      - It returns nothing → genuinely ambiguous → fall back to the old
 *        relay-wide filter, and remember that about this relay so the next
 *        channel skips the wait.
 *
 * Deciding on silence alone would have re-opened the firehose on every quiet
 * channel, which is most of them - keeping most of the bug while looking like a
 * fix.
 */
export async function subscribeChannelGames(
  channelId: string,
  onEvent: (ev: ParsedGameEvent) => void,
): Promise<() => void> {
  const b = await bridge();
  const relay = b.currentRelayUrl.get();
  const since = Math.floor(Date.now() / 1000) - GAME_LOG_WINDOW_SECONDS;
  const seen = new Set<string>();

  let closed = false;
  let delivered = false;
  let broadSub: (() => void) | null = null;
  let probeSub: (() => void) | null = null;
  let probeTimer: ReturnType<typeof setTimeout> | null = null;

  const handle = (ev: NostrEvent, fromTagged: boolean) => {
    if (fromTagged && !delivered) {
      // Proof the relay indexes the tag. Nothing more to find out, and nothing
      // more to listen to on the wide filter.
      delivered = true;
      tagIndexOk.set(relay, true);
      if (probeTimer !== null) { clearTimeout(probeTimer); probeTimer = null; }
      probeSub?.(); probeSub = null;
      broadSub?.(); broadSub = null;
    }
    if (seen.has(ev.id)) return;
    // Gate on the raw tag first. `parseGameEvent` parses the content blob, and
    // a foreign Stacker checkpoint is the biggest blob on this kind - there is
    // no reason to parse one to discover it isn't ours.
    if (ev.tags.find((t) => t[0] === 'h')?.[1] !== channelId) return;
    const parsed = parseGameEvent(ev as GameEvent);
    if (!parsed) return;
    seen.add(ev.id);
    onEvent(parsed);
  };

  const openBroad = () => {
    if (closed || delivered || broadSub) return;
    broadSub = b.subscribeFilterWatched(
      { kinds: [KIND_GAME], since },
      (ev) => handle(ev, false),
      { watchdogMs: GAME_SUB_WATCHDOG_MS },
    );
  };

  const taggedSub = b.subscribeFilterWatched(
    { kinds: [KIND_GAME], '#h': [channelId], since, limit: CHANNEL_GAME_LIMIT },
    (ev) => handle(ev, true),
    { watchdogMs: GAME_SUB_WATCHDOG_MS },
  );

  if (tagIndexOk.get(relay) === false) {
    // Already established that this relay needs it. No point re-probing.
    openBroad();
  } else if (tagIndexOk.get(relay) !== true) {
    probeTimer = setTimeout(() => {
      probeTimer = null;
      if (closed || delivered) return;
      probeSub = b.subscribeFilterWatched(
        { kinds: [KIND_GAME], '#t': [GAME_TAG], limit: 1 },
        () => {
          // The relay can index it after all, so the quiet `#h` sub is telling
          // the truth: nobody is playing in this channel.
          tagIndexOk.set(relay, true);
          probeSub?.(); probeSub = null;
          if (probeTimer !== null) { clearTimeout(probeTimer); probeTimer = null; }
        },
        { watchdogMs: GAME_SUB_WATCHDOG_MS },
      );
      probeTimer = setTimeout(() => {
        probeTimer = null;
        if (closed || delivered || tagIndexOk.get(relay) === true) return;
        tagIndexOk.set(relay, false);
        probeSub?.(); probeSub = null;
        openBroad();
      }, TAG_PROBE_MS);
    }, TAG_PROBE_MS);
  }

  return () => {
    closed = true;
    if (probeTimer !== null) { clearTimeout(probeTimer); probeTimer = null; }
    probeSub?.(); probeSub = null;
    broadSub?.(); broadSub = null;
    taggedSub();
  };
}
