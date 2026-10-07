/**
 * The bridge: groups. Values the code in
 * `services/nostr-bridge/groups/message/moderation.ts`,
 * `services/nostr-bridge/groups/message/state.ts` reads, kept here so every
 * reader imports the one copy.
 */

/**
 * Watchdog for the relay-wide group subs: metadata (39000) and admin/member
 * (39001/39002).
 *
 * These are deliberately unfiltered: one REQ for every group on the relay
 * rather than N per-group REQs. That makes them the most expensive queries the
 * app issues, and on a loaded relay expensive means *slow* rather than failed:
 * measured 2026-09-12 against public.obelisk.ar, `{kinds:[39000]}` took 20.9s
 * to deliver its first event, and `{kinds:[39001,39002]}` 20.4s. Twenty
 * seconds for twenty events.
 *
 * Under the 5s default that read as a dead subscription: torn down at 5s,
 * retried on backoff, each retry restarting the same 20s scan, so the channel
 * list never populated from the relay at all and the user saw only whatever
 * `seedCacheForRelay` had on disk. Worse, the retries were themselves load on
 * the relay that was already too slow.
 *
 * A slow answer is still an answer, and these subs have a cached fallback
 * painted underneath them, so waiting costs nothing a user can see. The only
 * thing given up is speed-to-verdict on a genuinely dead relay, and that
 * verdict is owned by the whitelist preflight and the connection banner, not
 * by this watchdog.
 */
export const GROUP_SUB_WATCHDOG_MS = 45_000;

/**
 * Tombstones held per class, across every group on the relay. FIFO: the
 * oldest deletion goes first. A tombstone is ~200 bytes (two 64-char ids, a
 * group id, Map overhead), so 5,000 is about 1 MB at worst. Evicting one is
 * safe: the per-group deletion REQs re-deliver up to 500 deletions each time
 * they reopen, and a deleted message only comes back if an older history
 * page is loaded after its tombstone aged out.
 */
export const MAX_TOMBSTONES = 5000;

// Per-channel message backfill cap. Only this many of the most recent kind 9
// events are pulled into `messagesByGroup` on the live REQ; older messages
// are paged in on demand via `loadMoreMessages`. Keeps the initial fan-out
// cheap when the user belongs to many channels and trims memory growth on
// long-lived sessions. See docs/data-system.md.
export const BACKGROUND_MESSAGE_LIMIT = 50;

export const LOAD_MORE_PAGE_SIZE = 50;

// How many of the most recent confirmed messages per channel get persisted to
// `bridgeCache`. Matched to BACKGROUND_MESSAGE_LIMIT so a cold load paints the
// same window the live REQ is about to request, stale-while-revalidate, with
// no visible "jump" when the relay echo lands.
export const MESSAGE_CACHE_LIMIT = 50;

// Debounce delay for message cache flushes. A backfill burst from the relay
// (kind 9 limit:50) lands as N synchronous ingest calls in the same tick; the
// debounce coalesces them into a single localStorage.setItem at the end.
// Short enough that a steady-state message arriving on its own still reaches
// disk well before the next reload window.
export const CACHE_FLUSH_DELAY_MS = 200;

/**
 * Upper bound on how long the background message-queue drain stays
 * paused waiting for the active channel's first EOSE / event. Without
 * this, an active channel that never responds (silent socket,
 * auth-gated relay that never delivers, watchdog-thrashing sub) would
 * starve every other channel's kind 9 sub indefinitely, and since
 * `ingestMessage` is where `ensureUserMetadata` is fanned out, that
 * also starves the profile-picture lookups for those channels'
 * authors. {@link ACTIVE_PRIORITY_MAX_PAUSE_MS} caps the pause; after
 * it elapses, the queue drains even if the active sub is still
 * `loading`. Tuned to give the watched channel a healthy head start
 * without leaving background data stranded for noticeably long.
 */
export const ACTIVE_PRIORITY_MAX_PAUSE_MS = 3000;

/**
 * Passive background message streams are useful for unread badges, but every
 * open group consumes a relay subscription. Keep a hard ceiling well under
 * public.obelisk.ar's 50-sub limit so global REQs, voice signaling, and the
 * currently-open channel have room. Active channels bypass this cap.
 */
export const MAX_BACKGROUND_MESSAGE_STREAMS = 8;

/**
 * Backoff schedule for empty-EOSE retries. Tuned so the worst-case time
 * before declaring a channel empty is the sum of all delays plus the
 * relay's own response time (≈9.5s + EOSE latency). Auth-gated relays
 * that send EOSE-empty before AUTH completes typically deliver real
 * events within the first 1500ms; the longer tail covers slow relays
 * and transient network hiccups.
 */
export const EMPTY_RETRY_DELAYS = [1500, 3000, 5000] as const;
