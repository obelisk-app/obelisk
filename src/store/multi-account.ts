/**
 * Per-account isolation factory for Zustand stores using `persist`.
 *
 * Without per-account namespacing, persisted state (read cursors, mutes,
 * DM protocol overrides, ...) leaks across logins on the same browser.
 * Each store calls this factory once and exports the returned `ensure`
 * function; AppGate invokes them all when `myPubkey` changes.
 *
 * Idempotent — a no-op when already pointing at the same account.
 */
type ZustandPersistApi = {
  persist: {
    setOptions: (opts: { name: string }) => void;
    rehydrate: () => Promise<void> | void;
  };
};

export function createEnsureForAccount(
  baseName: string,
  store: ZustandPersistApi,
): (myPubkey: string) => void {
  let active = baseName;
  return (myPubkey: string) => {
    const next = `${baseName}:${myPubkey}`;
    if (next === active) return;
    active = next;
    store.persist.setOptions({ name: next });
    void store.persist.rehydrate();
  };
}
