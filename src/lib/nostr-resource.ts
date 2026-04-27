/**
 * Generic relay-resource pattern.
 *
 * Every relay consumer in the app follows the same lifecycle:
 *   1. Render whatever's in cache immediately (synchronous read).
 *   2. Open a relay subscription and stream events as they arrive.
 *   3. Dedup: for replaceable kinds (0, 3, 10002, 10050) by created_at;
 *      for non-replaceable kinds (4, 1, 1059, 9735) by event id.
 *   4. Notify the consumer ONCE per state change — never spam re-renders.
 *
 * This module exposes two primitives:
 *   - `subscribeReplaceable<T>` — for "single-latest" resources (profile,
 *     follows, relay lists). Fires `onCache` synchronously with the hydrated
 *     value if any, then `onUpdate` when a strictly newer event lands.
 *   - `subscribeStream`        — for event streams (DMs, notes, zaps). Fires
 *     `onCache` for each cached event on subscribe, then `onNew` for each
 *     previously-unseen event from relays.
 *
 * Consumers don't need to know how dedup, persistence, or coalescing work —
 * the primitives encode the contract once. To migrate an existing fetcher
 * (`sharedCoalescer.enqueue` / `querySync`), wrap it with whichever
 * primitive matches its kind.
 */

import type { Event as NostrEvent } from 'nostr-tools/pure';
import type { Filter } from 'nostr-tools/filter';
import { sharedCoalescer } from '@/lib/nostr-coalescer';

/** Generic shape any replaceable resource conforms to. The signed event is
 *  kept on the entry so dedup-by-`created_at` works regardless of T. */
export interface ReplaceableEntry {
  event: NostrEvent;
}

export interface ReplaceableOptions<T extends ReplaceableEntry> {
  /** Filters to send to relays. Should match the kind of the resource. */
  filters: Filter[];
  /** Relays to query. Combined union — caller's responsibility to dedup. */
  relays: string[];
  /** Read the latest known value from cache (in-memory + localStorage). Synchronous. */
  hydrate: () => T | null;
  /** Persist a newer entry. Only called when the incoming event has a
   *  strictly newer `created_at` than the current cached entry. */
  persist: (value: T) => void;
  /** Parse an incoming event into the domain-typed entry. Called only after
   *  the dedup check passes. */
  parse: (event: NostrEvent) => T;
  /** Optional event predicate run before dedup — e.g. to filter on author. */
  match?: (event: NostrEvent) => boolean;
  /** Fires once on subscribe with the hydrated cached value if any. */
  onCache?: (value: T) => void;
  /** Fires when a strictly newer event lands. */
  onUpdate?: (value: T) => void;
  /** Optional gate on whether to actually open the relay subscription. Used
   *  by callers that want a TTL-gated re-fetch (e.g. profile-cache: re-fetch
   *  only if the cached lastCheckedAt is older than 24h). When `false`, the
   *  primitive still hydrates + fires `onCache` and returns a no-op
   *  teardown. Default: always fetch. */
  shouldFetch?: (cached: T | null) => boolean;
}

/**
 * Subscribe to a replaceable resource (kind 0/3/10002/10050 etc.).
 *
 * Order of effects on call:
 *   1. `hydrate()` runs; if it returns a value, `onCache(value)` is invoked
 *      synchronously before this function returns.
 *   2. The relay subscription starts. Events that don't pass `match` are
 *      ignored. Events that pass but aren't strictly newer than the
 *      currently-cached entry refresh nothing — they're benignly dropped.
 *   3. When a strictly newer event lands, `parse(event)` produces a fresh
 *      entry, `persist(entry)` writes it, and `onUpdate(entry)` fires.
 *
 * Returns a teardown function. Calling it after the subscription resolves is
 * a no-op.
 */
export function subscribeReplaceable<T extends ReplaceableEntry>(
  opts: ReplaceableOptions<T>,
): () => void {
  // Fire onCache synchronously off the consumer-provided hydrator. The
  // consumer is responsible for memoizing the hydrate result if their cache
  // layer is expensive — typically it's an in-memory map plus localStorage.
  let current: T | null = opts.hydrate();
  if (current && opts.onCache) opts.onCache(current);

  if (opts.shouldFetch && !opts.shouldFetch(current)) {
    return () => { /* no-op — relay subscription was skipped */ };
  }

  const close = sharedCoalescer.enqueue({
    filters: opts.filters,
    relays: opts.relays,
    onEvent: (event: NostrEvent) => {
      if (opts.match && !opts.match(event)) return;
      const cur = current;
      if (cur && cur.event.created_at >= event.created_at) return;
      const next = opts.parse(event);
      current = next;
      opts.persist(next);
      opts.onUpdate?.(next);
    },
  });

  return () => { close(); };
}

export interface StreamOptions {
  filters: Filter[];
  relays: string[];
  /** Iterable of cached events. Each is fed to `onCache` in arrival order. */
  hydrate: () => Iterable<NostrEvent>;
  /** Called for each previously-unseen event from relays. The implementation
   *  should write the event to the underlying cache (dedup-aware). */
  persist: (event: NostrEvent) => void;
  /** Optional gate before persist — e.g. signature verification, predicate
   *  filter. Returning false drops the event silently (no callbacks fire). */
  accept?: (event: NostrEvent) => boolean;
  /** Fires once per cached event on subscribe. */
  onCache?: (event: NostrEvent) => void;
  /** Fires once per previously-unseen relay event. */
  onNew?: (event: NostrEvent) => void;
}

/**
 * Subscribe to a stream of events (kind 4/1/1059/9735 etc.).
 *
 * Order of effects on call:
 *   1. `hydrate()` is iterated; `onCache(event)` fires for each yielded event.
 *   2. The relay subscription starts. For each incoming event:
 *      - If it's already in the seen-set (from cache or earlier stream), skip.
 *      - If `accept(event)` returns false, skip.
 *      - Otherwise, `persist(event)` and `onNew(event)`.
 *
 * Dedup is by event id, tracked locally for the lifetime of the subscription.
 *
 * Returns a teardown function.
 */
export function subscribeStream(opts: StreamOptions): () => void {
  const seen = new Set<string>();

  // Replay cached events via onCache. Adding their ids to `seen` prevents the
  // same events arriving from relays from re-firing as if they were new.
  for (const event of opts.hydrate()) {
    seen.add(event.id);
    opts.onCache?.(event);
  }

  const close = sharedCoalescer.enqueue({
    filters: opts.filters,
    relays: opts.relays,
    onEvent: (event: NostrEvent) => {
      if (seen.has(event.id)) return;
      seen.add(event.id);
      if (opts.accept && !opts.accept(event)) return;
      opts.persist(event);
      opts.onNew?.(event);
    },
  });

  return () => { close(); };
}
