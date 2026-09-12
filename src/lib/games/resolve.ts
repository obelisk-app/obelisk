/**
 * Resolve a table by its id, for a card that the channel subscription cannot
 * reach.
 *
 * The channel subscription only asks for the last 24 hours
 * (`GAME_LOG_WINDOW_SECONDS`) and is bounded by a `limit`, which is the right
 * trade for "what is live in here right now" and the wrong one for a card. A
 * `[[game:…]]` marker is an ordinary chat message: scroll back two days and the
 * card had nothing to render, forever — not slow, never. So a card that finds
 * itself with no session asks for its own table directly.
 *
 * Two filters, and the split matters:
 *
 *   { ids }                    — the create events. A table's id IS its create
 *                                event's id, and an exact-id filter is the most
 *                                universally indexed query in nostr, so this
 *                                sidesteps the whole "does this relay index
 *                                `#h`" question the channel sub has to worry
 *                                about (see `subscribeChannelGames`).
 *   { kinds, '#e': ids, limit } — the ops.
 *
 * Neither carries a `since`. That is the entire point.
 *
 * The two are disjoint — a create has no `e` tag pointing at itself, only ops
 * do (`buildGameOp`) — so no `limit` on the op filter can ever starve a create.
 * A card therefore always resolves to *something*. The residual: a table with
 * more than `RESOLVE_OP_LIMIT` ops can lose its old `start`, and would read
 * "Open table" for a live match until the channel sub fills the gap. Stacker
 * checkpoints run about one per ten seconds per seat, so that is a long match;
 * don't tighten the limit without raising the window.
 *
 * Requests are batched by id rather than issued per card: twelve unresolved
 * cards scrolling into view cost two REQs, not twenty-four.
 */
import { getBridge, getBridgeImpl } from '@/lib/nostr-bridge/client';
import { KIND_GAME } from '@/lib/nip-kinds';
import { useGamesStore } from '@/store/games';
import { registerClientResetHook } from '@/lib/reset';
import { ingestGameEvent } from './ingest';
import { parseGameEvent, type GameEvent } from './protocol';

/** How long ids accumulate before a batch goes out. */
export const RESOLVE_BATCH_MS = 250;
/** How long a batch's subscriptions stay open. No EOSE is exposed to us. */
export const RESOLVE_WAIT_MS = 4000;
/** Ids per batch. A filter is not a place to put an unbounded list. */
export const RESOLVE_MAX_IDS = 50;
/** Ops fetched per table. See the note above about `start` falling off. */
export const RESOLVE_OP_LIMIT = 200;
/** Backoff for ids that came back empty. Three attempts, then it stays a skeleton. */
export const RESOLVE_RETRY_MS = [4000, 12000] as const;

const WATCHDOG_MS = 4000;

let pending = new Set<string>();
/** id → attempts already made, so a card remounting cannot restart the ladder. */
const attempts = new Map<string, number>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;
const retryTimers = new Set<ReturnType<typeof setTimeout>>();

/** Does the store already have this table's create? Then there is nothing to ask. */
function resolved(gameId: string): boolean {
  const log = useGamesStore.getState().logs[gameId];
  return !!log?.some((e) => e.op === 'create');
}

/**
 * Ask for a table's log. Idempotent, and a no-op for a table we already have
 * or one whose retry ladder has run out.
 */
export function requestGameLoad(gameId: string): void {
  if (!gameId || resolved(gameId)) return;
  if (pending.has(gameId)) return;
  if ((attempts.get(gameId) ?? 0) > RESOLVE_RETRY_MS.length) return;
  pending.add(gameId);
  if (batchTimer === null) batchTimer = setTimeout(runBatch, RESOLVE_BATCH_MS);
}

function runBatch(): void {
  batchTimer = null;
  const all = [...pending];
  pending = new Set(all.slice(RESOLVE_MAX_IDS));
  const ids = all.slice(0, RESOLVE_MAX_IDS).filter((id) => !resolved(id));
  if (pending.size > 0 && batchTimer === null) {
    batchTimer = setTimeout(runBatch, RESOLVE_BATCH_MS);
  }
  if (ids.length === 0) return;
  for (const id of ids) attempts.set(id, (attempts.get(id) ?? 0) + 1);
  void fetchBatch(ids);
}

async function fetchBatch(ids: string[]): Promise<void> {
  let impl: NonNullable<ReturnType<typeof getBridgeImpl>>;
  try {
    await getBridge();
    const maybe = getBridgeImpl();
    if (!maybe) throw new Error('nostr bridge not initialized');
    impl = maybe;
  } catch (err) {
    console.warn('[games] table lookup could not reach the bridge', err);
    scheduleRetry(ids);
    return;
  }

  const onEvent = (ev: unknown) => {
    const parsed = parseGameEvent(ev as GameEvent);
    if (parsed) ingestGameEvent(parsed);
  };

  const subs = [
    impl.subscribeFilterWatched({ ids }, onEvent, { watchdogMs: WATCHDOG_MS }),
    impl.subscribeFilterWatched(
      { kinds: [KIND_GAME], '#e': ids, limit: RESOLVE_OP_LIMIT * ids.length },
      onEvent,
      { watchdogMs: WATCHDOG_MS },
    ),
  ];

  await new Promise<void>((resolve) => setTimeout(resolve, RESOLVE_WAIT_MS));
  for (const unsub of subs) unsub();
  scheduleRetry(ids.filter((id) => !resolved(id)));
}

function scheduleRetry(ids: readonly string[]): void {
  for (const id of ids) {
    const made = attempts.get(id) ?? 1;
    const delay = RESOLVE_RETRY_MS[made - 1];
    if (delay === undefined) continue;
    const t = setTimeout(() => {
      retryTimers.delete(t);
      if (resolved(id)) return;
      pending.add(id);
      if (batchTimer === null) batchTimer = setTimeout(runBatch, RESOLVE_BATCH_MS);
    }, delay);
    retryTimers.add(t);
  }
}

/** Test seam, and the login/logout teardown hook (registered at the bottom). */
export function __resetGameResolver(): void {
  pending = new Set();
  attempts.clear();
  if (batchTimer !== null) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
  for (const t of retryTimers) clearTimeout(t);
  retryTimers.clear();
}

// In-flight lookups belong to the account that asked for them: the next one may
// not even be able to read those tables.
registerClientResetHook(__resetGameResolver);
