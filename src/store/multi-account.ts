/**
 * Per-account isolation factory for Zustand stores using `persist`.
 *
 * Without per-account namespacing, persisted state (read cursors, mutes,
 * DM protocol overrides, ...) leaks across logins on the same browser.
 * Each store calls this factory once and exports the returned `ensure`
 * function; `ReadStateRoot` (src/services/read-state/root.tsx) invokes them all
 * when `myPubkey` changes, and the bridge calls two of them early in
 * `finalizeLogin` so the first ingest lands under the right key.
 *
 * Idempotent: a no-op when already pointing at the same account.
 *
 * ## Why the clear lives in `merge`, not in a `setState` call
 *
 * zustand's `rehydrate()` MERGES what it finds into the current state. An
 * account with nothing stored would therefore inherit the previous account's
 * state in memory, and its next `set()` would persist that under its own key.
 * One user's mute list silently became another's.
 *
 * The obvious cure, `store.setState(initial)` before re-keying, is itself a
 * bug: `persist` wraps `setState` so that EVERY call writes through to the
 * active key. Before the re-key that overwrites the outgoing account's saved
 * data with an empty state; after it, it overwrites the incoming account's
 * saved data before `rehydrate()` gets to read it. The only `set` that does
 * not write through is the one `rehydrate()` uses internally, so the clear
 * has to happen inside the merge: the stored slice is layered over the
 * store's own initial state rather than over whatever is in memory.
 *
 * The factory takes the initial state from `store.getInitialState()`, which
 * every `create()(persist(...))` store provides, so there is nothing for a
 * new store to supply and nothing it can forget.
 *
 * Requires synchronous storage (localStorage): `rehydrate()` then settles
 * before it returns, so `hasHydrated()` is a definitive verdict and a
 * failed hydrate (corrupt JSON under the new key) can fall back to the
 * initial state instead of leaving the previous account's data in memory.
 */
import type { StoreApi } from 'zustand';

type Merge<S> = (persistedState: unknown, currentState: S) => S;

/**
 * The shape a store must have to be isolated per account. Every store built
 * with `create()(persist(...))` satisfies it structurally.
 */
export type PerAccountStore<S extends object> = Pick<StoreApi<S>, 'getInitialState' | 'setState'> & {
  persist: {
    getOptions: () => { merge?: Merge<S> };
    setOptions: (opts: { name?: string; merge?: Merge<S> }) => void;
    rehydrate: () => Promise<void> | void;
    hasHydrated: () => boolean;
  };
};

/**
 * Point `store` at the per-account persist key `${baseName}:${myPubkey}`.
 *
 * Passing `null` detaches: the store goes back to its initial state and to
 * the unscoped `baseName` key, so that nothing written afterwards (the
 * logout chain's `reset()` calls, for instance) can land on the outgoing
 * account's data. `baseName` holds nothing that any code path still reads;
 * it is where state lived before per-account scoping existed.
 */
export function createEnsureForAccount<S extends object>(
  baseName: string,
  store: PerAccountStore<S>,
): (myPubkey: string | null) => void {
  const fresh = store.getInitialState();
  const storeMerge: Merge<S> =
    store.persist.getOptions().merge ??
    ((persisted, current) => ({ ...current, ...(persisted as Partial<S>) }));
  // The store's own merge still decides WHAT is taken from storage (each
  // store's versioned merge keeps only valid saved fields, see
  // persist-version.ts); this only changes what it is merged ONTO.
  store.persist.setOptions({ merge: (persisted) => storeMerge(persisted, fresh) });

  let active = baseName;
  return (myPubkey) => {
    const next = myPubkey === null ? baseName : `${baseName}:${myPubkey}`;
    if (next === active) return;
    active = next;
    store.persist.setOptions({ name: next });
    if (myPubkey === null) {
      // Write-through lands on the unscoped key, which is the point.
      store.setState(fresh, true);
      return;
    }
    void store.persist.rehydrate();
    if (!store.persist.hasHydrated()) {
      // Storage is synchronous, so this is a failed hydrate (unparseable
      // JSON under the new key), not one still in flight. The previous
      // account's state is still in memory; replace it. The write-through
      // overwrites the unreadable entry, which is the right recovery.
      store.setState(fresh, true);
    }
  };
}
