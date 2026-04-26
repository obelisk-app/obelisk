/**
 * Keyed observable primitive — the shared state holder for browser-side
 * Nostr caches.
 *
 * Each instance manages a `Map<K, Slot<V>>` plus a per-key subscriber set
 * and a global ("any key") subscriber set. Writes deduplicate optionally
 * via a content-equality check; only changes fan out notifications, so
 * components subscribed via `useSyncExternalStore` re-render on real
 * change, not on no-op refreshes.
 *
 * Lives below the existing per-domain caches (profile, relay-list,
 * follows). Each cache wraps an instance of this primitive instead of
 * reinventing its own Map + subscribers + dedup logic.
 */

export type SlotStatus = 'idle' | 'loading' | 'fresh' | 'error';

export interface Slot<V> {
  value: V | undefined;
  status: SlotStatus;
  lastFetched: number; // ms timestamp; 0 = never fetched
  error?: Error;
}

export interface KeyedObservableOptions<V> {
  /**
   * Optional content-equality check. If `set(key, v)` is called and the
   * existing slot's value is `equal` to `v`, only `lastFetched` is bumped
   * — no subscriber notifications fire. Used by SWR caches to skip
   * fan-out when a refresh returns identical data.
   */
  equal?: (a: V, b: V) => boolean;
}

export interface KeyedObservable<K, V> {
  /** Read the current slot for `key`. Always returns a stable reference
   *  until the slot is mutated, so it's safe as a `useSyncExternalStore`
   *  snapshot. */
  get(key: K): Slot<V>;
  /** Replace the slot's value, mark it `fresh`, bump `lastFetched`, and
   *  notify subscribers (unless `equal` says nothing changed). */
  set(key: K, value: V): void;
  /** Move a slot to `loading` / `error` without changing the value.
   *  Notifies subscribers because `status` is part of the slot identity. */
  setStatus(key: K, status: SlotStatus, error?: Error): void;
  /** Subscribe to changes for one key. Returns an unsubscribe function. */
  subscribe(key: K, cb: (slot: Slot<V>) => void): () => void;
  /** Subscribe to changes for any key. Returns an unsubscribe function. */
  subscribeAll(cb: (key: K, slot: Slot<V>) => void): () => void;
  /** Drop everything (test/teardown). */
  _reset(): void;
}

const EMPTY_SLOT: Slot<unknown> = Object.freeze({ value: undefined, status: 'idle', lastFetched: 0 });

export function createKeyedObservable<K, V>(opts: KeyedObservableOptions<V> = {}): KeyedObservable<K, V> {
  const slots = new Map<K, Slot<V>>();
  const perKeySubs = new Map<K, Set<(slot: Slot<V>) => void>>();
  const allSubs = new Set<(key: K, slot: Slot<V>) => void>();

  function get(key: K): Slot<V> {
    return slots.get(key) ?? (EMPTY_SLOT as Slot<V>);
  }

  function notify(key: K, slot: Slot<V>): void {
    perKeySubs.get(key)?.forEach((cb) => cb(slot));
    allSubs.forEach((cb) => cb(key, slot));
  }

  function set(key: K, value: V): void {
    const prev = slots.get(key);
    if (prev?.value !== undefined && opts.equal && opts.equal(prev.value, value)) {
      // Content unchanged — bump lastFetched but DO NOT notify. The slot
      // identity changes (lastFetched), but no consumer cares.
      slots.set(key, { ...prev, status: 'fresh', lastFetched: Date.now() });
      return;
    }
    const slot: Slot<V> = { value, status: 'fresh', lastFetched: Date.now() };
    slots.set(key, slot);
    notify(key, slot);
  }

  function setStatus(key: K, status: SlotStatus, error?: Error): void {
    const prev = slots.get(key) ?? (EMPTY_SLOT as Slot<V>);
    if (prev.status === status && prev.error === error) return;
    const slot: Slot<V> = { ...prev, status, error };
    slots.set(key, slot);
    notify(key, slot);
  }

  function subscribe(key: K, cb: (slot: Slot<V>) => void): () => void {
    let set = perKeySubs.get(key);
    if (!set) { set = new Set(); perKeySubs.set(key, set); }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) perKeySubs.delete(key);
    };
  }

  function subscribeAll(cb: (key: K, slot: Slot<V>) => void): () => void {
    allSubs.add(cb);
    return () => { allSubs.delete(cb); };
  }

  function _reset(): void {
    slots.clear();
    perKeySubs.clear();
    allSubs.clear();
  }

  return { get, set, setStatus, subscribe, subscribeAll, _reset };
}
