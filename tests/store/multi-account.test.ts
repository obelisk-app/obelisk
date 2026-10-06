/**
 * The factory's contract, tested against a minimal store so that each
 * guarantee is visible on its own rather than through one of the six real
 * stores. The per-store round trips live in each store's own test file.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { create } from 'zustand';
import { persist, createJSONStorage, type PersistOptions } from 'zustand/middleware';
import { createEnsureForAccount } from '@/store/multi-account';

interface Tiny {
  items: string[];
  /** Deliberately not persisted by the custom-merge store below. */
  flag: boolean;
  add: (s: string) => void;
}

let n = 0;
function makeStore(opts: { merge?: PersistOptions<Tiny>['merge'] } = {}) {
  // Unique name per store: the factory keeps module-level state per store.
  const name = `tiny-${++n}`;
  const store = create<Tiny>()(
    persist(
      (set) => ({
        items: [],
        flag: false,
        add: (s) => set((st) => ({ items: [...st.items, s] })),
      }),
      { name, storage: createJSONStorage(() => localStorage), ...opts },
    ),
  );
  return { name, store, ensure: createEnsureForAccount(name, store) };
}

const read = (key: string) =>
  (JSON.parse(localStorage.getItem(key) ?? 'null') as { state: Partial<Tiny> } | null)?.state;

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

describe('createEnsureForAccount', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('an account with nothing stored comes up as the initial state, not as the previous account', () => {
    const { store, ensure } = makeStore();
    ensure(A);
    store.getState().add('from-a');

    ensure(B);
    expect(store.getState().items).toEqual([]);
  });

  it('switching writes nothing at all; the outgoing account key is untouched', () => {
    const { name, store, ensure } = makeStore();
    ensure(A);
    store.getState().add('from-a');
    const before = read(`${name}:${A}`);

    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    ensure(B);
    expect(setItem).not.toHaveBeenCalled();
    expect(read(`${name}:${A}`)).toEqual(before);
  });

  it('the incoming account is read before anything could overwrite it', () => {
    const { name, store, ensure } = makeStore();
    localStorage.setItem(`${name}:${B}`, JSON.stringify({ state: { items: ['b-had-this'] }, version: 0 }));
    ensure(A);
    store.getState().add('from-a');

    ensure(B);
    expect(store.getState().items).toEqual(['b-had-this']);
    expect(read(`${name}:${B}`)?.items).toEqual(['b-had-this']);
  });

  it('round trip: the first account comes back exactly as it was left', () => {
    const { store, ensure } = makeStore();
    ensure(A);
    store.getState().add('from-a');
    ensure(B);
    store.getState().add('from-b');
    ensure(A);
    expect(store.getState().items).toEqual(['from-a']);
  });

  it("composes with the store's own merge instead of replacing it", () => {
    // A store-level merge that refuses to take `flag` from storage (the way
    // dm.ts refuses legacy plaintext fields) must still be honoured, while
    // the base it merges onto becomes the initial state.
    const { name, store, ensure } = makeStore({
      merge: (persisted, current) => ({
        ...current,
        items: (persisted as Partial<Tiny> | undefined)?.items ?? [],
        flag: false,
      }),
    });
    localStorage.setItem(`${name}:${B}`, JSON.stringify({ state: { items: ['b'], flag: true }, version: 0 }));
    ensure(A);
    store.setState({ flag: true });
    store.getState().add('from-a');

    ensure(B);
    expect(store.getState().items).toEqual(['b']);
    expect(store.getState().flag).toBe(false);
  });

  it('unparseable storage under the new key falls back to the initial state, never to the previous account', () => {
    const { name, store, ensure } = makeStore();
    localStorage.setItem(`${name}:${B}`, '{not json');
    ensure(A);
    store.getState().add('from-a');

    ensure(B);
    expect(store.getState().items).toEqual([]);
    // The unreadable entry was replaced with something readable.
    expect(read(`${name}:${B}`)?.items).toEqual([]);
  });

  it('is idempotent: asking for the current account again does not rehydrate', () => {
    const { store, ensure } = makeStore();
    ensure(A);
    const rehydrate = vi.spyOn(store.persist, 'rehydrate');
    ensure(A);
    expect(rehydrate).not.toHaveBeenCalled();
  });

  it('null detaches: initial state in memory, later writes go to the unscoped key', () => {
    const { name, store, ensure } = makeStore();
    ensure(A);
    store.getState().add('from-a');

    ensure(null);
    expect(store.getState().items).toEqual([]);
    store.getState().add('after-logout');
    expect(read(`${name}:${A}`)?.items).toEqual(['from-a']);
    expect(read(name)?.items).toEqual(['after-logout']);

    // Logging in again picks the account data back up.
    ensure(A);
    expect(store.getState().items).toEqual(['from-a']);
  });
});
