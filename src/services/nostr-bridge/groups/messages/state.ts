/**
 * The group-message state (kind 9), shared by the parts of the messages
 * module (`./queue.ts`, `./stream.ts`, `./retry.ts`, `./send.ts`,
 * `./ingest.ts`): the two stores the chat pane reads, the per-group REQ
 * bookkeeping, the deferred queue, the active-channel priority gate, the
 * empty-EOSE retry ladder, the cache flush timers and the optimistic sends.
 * Pure move of the facade's field block (round 4 plan, step 14).
 */
import type { TrackedSub } from '../../context';
import { StateStore } from '../../state-store';
import type { JsMessage, MessagesStatus } from '../../types';

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

export class MessagesState {
  /** The channel in view; its REQ goes first and pauses the background drain. */
  activeGroupId: string | null = null;
  readonly messagesByGroup = new StateStore<Record<string, JsMessage[]>>({});
  /**
   * Per-group confidence enum for the kind 9 messages stream. See
   * {@link MessagesStatus} for transitions. The chat pane reads this to
   * decide between "Loading messages…" (loading | empty-unconfirmed) and
   * "No messages yet" (empty-confirmed). Empty-unconfirmed exists because
   * auth-gated relays routinely send EOSE-empty fast and trickle real
   * events afterwards; the bridge stays in that state through up to
   * `EMPTY_RETRY_DELAYS`.length restarts before promoting to
   * empty-confirmed, so the UI never falsely flashes "No messages".
   */
  readonly messagesStatusByGroup = new StateStore<Record<string, MessagesStatus>>({});
  // Group ids we already have a message subscription for.
  readonly subscribedGroups = new Set<string>();
  /**
   * Per-group kind 9 subscription handles. Tracked so
   * `refresh` can close the previous sub before opening
   * a fresh one, without this the bridge would leak stale subs every time
   * a chat panel re-mounts a stale channel.
   */
  readonly subByGroup = new Map<string, TrackedSub>();
  /**
   * Background queue for kind 9 message subscriptions discovered via
   * `ingestGroupMetadata`. The relay typically streams hundreds of kind
   * 39000 events back-to-back at login; firing N message REQs in the same
   * tick floods the relay's per-connection sub limit and the channel the
   * user is actually looking at ends up at the back of the response queue.
   * Instead, we queue background subs here and process them in small
   * batches, the active group is always fast-tracked via
   * `setActiveGroup` or the priority bump so the
   * channel currently in view gets its history first.
   *
   * Maintained as both an ordered array (for FIFO drain) and a Set (for
   * O(1) dedup). Cleared on relay switch / logout alongside
   * `messageSubscribedGroups` so old work doesn't leak into a new pool.
   */
  pendingQueue: string[] = [];
  readonly pendingSet = new Set<string>();
  pendingTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Wall-clock deadline after which the active-channel priority gate
   * stops pausing the background drain. Set on every `setActiveGroup`
   * call; reset to 0 on logout / relay switch / pool reset.
   */
  priorityDeadline = 0;
  /**
   * Single-shot timer that fires at `priorityDeadline`
   * and force-releases the gate. Without an explicit fire, a queue that
   * arrived while the gate was engaged would sit forever if the active
   * sub never produced an EOSE / event to trigger
   * `maybeResume`.
   */
  priorityTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Per-group retry tracking for the kind 9 stream. Populated on the first
   * empty EOSE; cleared on first event ingest, channel logout, or after
   * `EMPTY_RETRY_DELAYS`.length restarts (whichever comes first).
   *
   * `attempts` counts the number of retries already executed (0 = just got
   * first EOSE-empty, no retry yet). `sawEvent` is currently informational
   *, the authoritative event check happens against `messagesByGroup` on
   * retry-fire so we don't race the StateStore.
   */
  readonly retryByGroup = new Map<string, {
    attempts: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>();
  /**
   * Per-group flag for the cold-load `querySync` fallback. The bridge
   * fires one explicit `pool.querySync` after the empty-EOSE retry
   * ladder exhausts, bypasses the live REQ retry loop and gives the
   * relay a last shot to deliver kind 9 once AUTH / whitelist state
   * has had time to settle. Single-shot per groupId per session;
   * cleared on logout / relay switch / dispose, and reset by
   * `refresh` so an explicit user retry can fire
   * it again.
   */
  readonly querySyncFallbackFired = new Set<string>();
  /**
   * Per-group debounce timers for message-cache flushes. Coalesces a burst
   * of `ingestMessage` calls (typical of a kind 9 limit:50 backfill arriving
   * in one tick) into a single localStorage.setItem at the end of the
   * burst. Cleared on logout / dispose / relay switch, see
   * the lifecycle's `clearFlushers`.
   */
  readonly cacheFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /**
   * Original send arguments for in-flight or just-failed group-message
   * publishes, keyed by `clientTag`. Survives the publish itself so a retry
   * can replay the exact same content / replyTo / created_at, replaying
   * with a fresh `created_at` would let two NIP-29 events with different ids
   * both reach the relay, leaving a duplicate behind.
   */
  readonly pendingSends = new Map<string, {
    groupId: string;
    content: string;
    replyTo: { id: string; pubkey: string } | null;
    emojiTags: string[][];
    createdAt: number;
  }>();

  /**
   * Write `status` to `messagesStatusByGroup[groupId]` only if it changed,
   * so React subscribers don't churn on redundant writes.
   */
  setStatus(groupId: string, status: MessagesStatus): void {
    this.messagesStatusByGroup.update((prev) => {
      if (prev[groupId] === status) return prev;
      return { ...prev, [groupId]: status };
    });
  }
}
