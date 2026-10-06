/**
 * Stops the page from writing removed data straight back.
 *
 * Removing a category's keys does not touch what is in memory: a persisted
 * Zustand store writes its whole state on its next `set`, the bridge cache
 * writes on the next relay event, the wrap ledger on a debounce. Between the
 * removal and the reload any of them would put the old data back, under the
 * same key. Resetting every store by hand is not an answer either: a reset
 * store would, for instance, publish empty read cursors to the relays from
 * its `pagehide` flush.
 *
 * So the fence leaves memory alone and drops the writes instead: after it is
 * raised, `setItem` on localStorage or sessionStorage for a key the
 * predicate claims is a silent no-op, until the page goes away (or, in a
 * test, until `lower()`). Every writer in the app reaches storage through
 * `Storage.prototype.setItem` (the stores' adapters, `createLocalStore`, the
 * bridge cache and the raw calls), so one patch covers them all.
 */

type Predicate = (key: string) => boolean;

const fences = new Set<Predicate>();
let original: Storage['setItem'] | null = null;

function install(): void {
  if (original || typeof Storage === 'undefined') return;
  const native = Storage.prototype.setItem;
  original = native;
  Storage.prototype.setItem = function fencedSetItem(this: Storage, key: string, value: string): void {
    const k = String(key);
    for (const fenced of fences) if (fenced(k)) return;
    native.call(this, k, value);
  };
}

function uninstall(): void {
  if (!original || fences.size > 0) return;
  Storage.prototype.setItem = original;
  original = null;
}

/** Drop every later write to a key `blocks` claims. Returns the function that lifts this fence. */
export function raiseWriteFence(blocks: Predicate): () => void {
  fences.add(blocks);
  install();
  return () => {
    fences.delete(blocks);
    uninstall();
  };
}

/** Lift every fence (tests only: in the app the reload lifts them). */
export function lowerAllWriteFences(): void {
  fences.clear();
  uninstall();
}
