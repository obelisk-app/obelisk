import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useReadStateStore,
  ensureReadStateStoreForAccount,
  READ_STATE_INITIAL,
  READ_STATE_STORE_VERSION,
} from '@/store/read-state';
import { CORRUPT_STATES, freshPubkey, readBlob, seedBlob } from './persist-blob';

describe('useReadStateStore', () => {
  beforeEach(() => {
    useReadStateStore.setState({ ...READ_STATE_INITIAL });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('quota resilience', () => {
    // Regression: cursors advance on nearly every click (auto-mark-read),
    // and each advance persists the store. With localStorage at the origin
    // quota this used to throw "Failed to execute 'setItem' on 'Storage'"
    // on every interaction. The quota-safe storage adapter must absorb it.
    it('cursor writes do not throw when localStorage is full', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError');
      });

      expect(() => {
        useReadStateStore.getState().setGroupCursor('g1', 1000);
        useReadStateStore.getState().setDmCursor('alice', 2000);
        useReadStateStore.getState().markAllAsRead(['alice'], ['g1']);
      }).not.toThrow();

      spy.mockRestore();
      // In-memory state still advanced even though persistence was lost.
      expect(useReadStateStore.getState().groupCursors['g1']).toBeGreaterThanOrEqual(1000);
      expect(useReadStateStore.getState().dmCursors['alice']).toBeGreaterThanOrEqual(2000);
    });
  });

  it('starts empty', () => {
    const s = useReadStateStore.getState();
    expect(s.dmCursors).toEqual({});
    expect(s.groupCursors).toEqual({});
    expect(s.inboxLastReadAt).toBe(0);
  });

  describe('setDmCursor', () => {
    it('writes a cursor for a new peer', () => {
      useReadStateStore.getState().setDmCursor('alice', 1000);
      expect(useReadStateStore.getState().dmCursors['alice']).toBe(1000);
    });

    it('only advances, never moves backwards', () => {
      useReadStateStore.getState().setDmCursor('alice', 5000);
      useReadStateStore.getState().setDmCursor('alice', 3000);
      expect(useReadStateStore.getState().dmCursors['alice']).toBe(5000);
    });

    it('no-ops when tsMs equals existing cursor (idempotent)', () => {
      useReadStateStore.getState().setDmCursor('alice', 1000);
      const before = useReadStateStore.getState().dmCursors;
      useReadStateStore.getState().setDmCursor('alice', 1000);
      expect(useReadStateStore.getState().dmCursors).toBe(before);
    });
  });

  describe('setGroupCursor', () => {
    it('advances and is monotonic just like dmCursors', () => {
      useReadStateStore.getState().setGroupCursor('g1', 100);
      useReadStateStore.getState().setGroupCursor('g1', 200);
      useReadStateStore.getState().setGroupCursor('g1', 50);
      expect(useReadStateStore.getState().groupCursors['g1']).toBe(200);
    });
  });

  describe('cursors', () => {
    it('advanceInboxRead sets inboxLastReadAt to ~now', () => {
      const before = Date.now();
      useReadStateStore.getState().advanceInboxRead();
      const after = Date.now();
      const ts = useReadStateStore.getState().inboxLastReadAt;
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('markAllAsRead advances inbox + every supplied DM peer + every supplied channel', () => {
      const before = Date.now();
      useReadStateStore.getState().markAllAsRead(['alice', 'bob'], ['g1', 'g2']);
      const after = Date.now();
      const s = useReadStateStore.getState();
      expect(s.inboxLastReadAt).toBeGreaterThanOrEqual(before);
      expect(s.inboxLastReadAt).toBeLessThanOrEqual(after);
      expect(s.dmCursors['alice']).toBeGreaterThanOrEqual(before);
      expect(s.dmCursors['bob']).toBeGreaterThanOrEqual(before);
      expect(s.groupCursors['g1']).toBeGreaterThanOrEqual(before);
      expect(s.groupCursors['g2']).toBeGreaterThanOrEqual(before);
    });

    it('markAllAsRead is a single set(): subscribers re-render once', () => {
      let renders = 0;
      const unsub = useReadStateStore.subscribe(() => { renders++; });
      useReadStateStore.getState().markAllAsRead(['alice'], ['g1']);
      unsub();
      expect(renders).toBe(1);
    });

    it('markAllAsRead never moves any cursor backwards', () => {
      const future = Date.now() + 60_000;
      useReadStateStore.getState().setDmCursor('alice', future);
      useReadStateStore.getState().setGroupCursor('g1', future);
      useReadStateStore.getState().markAllAsRead(['alice'], ['g1']);
      const s = useReadStateStore.getState();
      // cursors were already past now: markAllAsRead must not regress them
      expect(s.dmCursors['alice']).toBe(future);
      expect(s.groupCursors['g1']).toBe(future);
    });

    it('markAllAsRead with only channels leaves the DM notification cursor advanced but no peers', () => {
      // The desktop bell's "mentions" tab calls markAllAsRead([], groupIds).
      useReadStateStore.getState().markAllAsRead([], ['g1']);
      const s = useReadStateStore.getState();
      expect(s.dmCursors).toEqual({});
      expect(s.groupCursors['g1']).toBeGreaterThan(0);
    });
  });

  describe('applyRemoteState', () => {
    it('merges new dm cursors and advances existing ones monotonically', () => {
      useReadStateStore.getState().setDmCursor('alice', 100);
      useReadStateStore.getState().setDmCursor('bob', 500);
      useReadStateStore.getState().applyRemoteState({
        dmCursors: { alice: 200, bob: 300, carol: 1000 },
      });
      const s = useReadStateStore.getState();
      expect(s.dmCursors['alice']).toBe(200);  // advanced
      expect(s.dmCursors['bob']).toBe(500);    // remote was older, unchanged
      expect(s.dmCursors['carol']).toBe(1000); // new peer
    });

    it('merges group cursors monotonically', () => {
      useReadStateStore.getState().setGroupCursor('g1', 100);
      useReadStateStore.getState().applyRemoteState({
        groupCursors: { g1: 50, g2: 999 },
      });
      const s = useReadStateStore.getState();
      expect(s.groupCursors['g1']).toBe(100);  // older, kept local
      expect(s.groupCursors['g2']).toBe(999);  // new
    });

    it('advances inboxLastReadAt only when remote is newer', () => {
      useReadStateStore.setState({ inboxLastReadAt: 500 });
      useReadStateStore.getState().applyRemoteState({ inboxLastReadAt: 200 });
      expect(useReadStateStore.getState().inboxLastReadAt).toBe(500);
      useReadStateStore.getState().applyRemoteState({ inboxLastReadAt: 1000 });
      expect(useReadStateStore.getState().inboxLastReadAt).toBe(1000);
    });

    it('is a no-op when nothing is newer (object identity preserved)', () => {
      useReadStateStore.getState().setGroupCursor('g1', 500);
      const before = useReadStateStore.getState();
      useReadStateStore.getState().applyRemoteState({
        groupCursors: { g1: 100 },
      });
      const after = useReadStateStore.getState();
      // Same object reference signals "no setState" for downstream subscribers.
      expect(after.groupCursors).toBe(before.groupCursors);
    });

    it('handles a fully empty snapshot', () => {
      useReadStateStore.getState().setGroupCursor('g1', 500);
      useReadStateStore.getState().applyRemoteState({});
      expect(useReadStateStore.getState().groupCursors['g1']).toBe(500);
    });

    it('atomically merges all three categories in one update', () => {
      let renderCount = 0;
      const unsub = useReadStateStore.subscribe(() => { renderCount++; });
      useReadStateStore.getState().applyRemoteState({
        dmCursors: { alice: 100 },
        groupCursors: { g1: 200 },
        inboxLastReadAt: 300,
      });
      unsub();
      // Single set() call; downstream subscribers re-render exactly once.
      expect(renderCount).toBe(1);
    });
  });

  describe('reset', () => {
    it('wipes all cursors', () => {
      useReadStateStore.getState().setDmCursor('alice', 1000);
      useReadStateStore.getState().setGroupCursor('g1', 2000);
      useReadStateStore.getState().advanceInboxRead();
      useReadStateStore.getState().reset();
      const s = useReadStateStore.getState();
      expect(s.dmCursors).toEqual({});
      expect(s.groupCursors).toEqual({});
      expect(s.inboxLastReadAt).toBe(0);
    });
  });
});

describe('per-account read-state store', () => {
  beforeEach(() => {
    localStorage.clear();
    useReadStateStore.setState({ ...READ_STATE_INITIAL });
  });

  // The ensure is a module-level no-op for the account it already points
  // at, so every test below uses pubkeys no other test in this file uses.
  const stored = (pubkey: string) =>
    (JSON.parse(localStorage.getItem(`obelisk-read-state:${pubkey}`) ?? 'null') as
      { state: typeof READ_STATE_INITIAL } | null)?.state;
  const persistedSlice = () => {
    const { dmCursors, groupCursors, inboxLastReadAt } = useReadStateStore.getState();
    return { dmCursors, groupCursors, inboxLastReadAt };
  };

  // Storage is synchronous, so no tick is awaited anywhere here: the factory
  // relies on `rehydrate()` settling before it returns.
  it('persist key includes the active pubkey', () => {
    const A = 'a'.repeat(64);
    ensureReadStateStoreForAccount(A);
    useReadStateStore.getState().setDmCursor('peer-1', 12345);
    expect(stored(A)?.dmCursors).toEqual({ 'peer-1': 12345 });
  });

  it('a second account starts from the initial state, and the first account survives the round trip', () => {
    const A = 'c'.repeat(64);
    const B = 'd'.repeat(64);

    ensureReadStateStoreForAccount(A);
    useReadStateStore.getState().setDmCursor('peer-1', 100);
    useReadStateStore.getState().setGroupCursor('g1', 200);
    const aSlice = persistedSlice();
    expect(stored(A)).toEqual(aSlice);

    // B has nothing stored. It must come up as a brand-new account: zustand's
    // rehydrate() merges, so without the factory's clear B would inherit A's
    // cursors in memory and persist them under its own key.
    ensureReadStateStoreForAccount(B);
    expect(persistedSlice()).toEqual(READ_STATE_INITIAL);
    // ...and the switch itself wrote nothing to A's key.
    expect(stored(A)).toEqual(aSlice);

    // B's own writes land under B's key only.
    useReadStateStore.getState().setDmCursor('peer-2', 300);
    expect(stored(B)?.dmCursors).toEqual({ 'peer-2': 300 });
    expect(stored(A)).toEqual(aSlice);

    // Back to A: A's cursors come up intact, with nothing of B's in them.
    ensureReadStateStoreForAccount(A);
    expect(persistedSlice()).toEqual(aSlice);
    expect(useReadStateStore.getState().dmCursors['peer-2']).toBeUndefined();
  });

  it('detaching (logout) resets memory and stops writes reaching the account key', () => {
    const A = 'e'.repeat(64);
    ensureReadStateStoreForAccount(A);
    useReadStateStore.getState().setGroupCursor('g1', 500);
    const aSlice = persistedSlice();

    ensureReadStateStoreForAccount(null);
    expect(persistedSlice()).toEqual(READ_STATE_INITIAL);
    // What the logout chain does next must not touch A's saved cursors.
    useReadStateStore.getState().reset();
    expect(stored(A)).toEqual(aSlice);
  });
});

describe('read-state store saved-data migrations', () => {
  const key = (pk: string) => `obelisk-read-state:${pk}`;

  it('a version 0 blob keeps every cursor and is saved back under the current version', () => {
    const pk = freshPubkey();
    const saved = { dmCursors: { alice: 1_000 }, groupCursors: { g1: 2_000 }, inboxLastReadAt: 3_000 };
    seedBlob(key(pk), saved, 0);
    ensureReadStateStoreForAccount(pk);
    const { dmCursors, groupCursors, inboxLastReadAt } = useReadStateStore.getState();
    expect({ dmCursors, groupCursors, inboxLastReadAt }).toEqual(saved);
    expect(readBlob(key(pk))).toEqual({ state: saved, version: READ_STATE_STORE_VERSION });
  });

  it('drops cursors that are not finite numbers instead of comparing against them', () => {
    const pk = freshPubkey();
    seedBlob(key(pk), {
      dmCursors: { alice: 1_000, bob: '2000', carol: null },
      groupCursors: { g1: 5, g2: { at: 1 } },
      inboxLastReadAt: 'yesterday',
    }, 0);
    ensureReadStateStoreForAccount(pk);
    const { dmCursors, groupCursors, inboxLastReadAt } = useReadStateStore.getState();
    expect({ dmCursors, groupCursors, inboxLastReadAt }).toEqual({
      dmCursors: { alice: 1_000 }, groupCursors: { g1: 5 }, inboxLastReadAt: 0,
    });
  });

  it.each(CORRUPT_STATES)('falls back to the defaults on %s', (_label, state, version) => {
    const pk = freshPubkey();
    seedBlob(key(pk), state, version);
    expect(() => ensureReadStateStoreForAccount(pk)).not.toThrow();
    const { dmCursors, groupCursors, inboxLastReadAt } = useReadStateStore.getState();
    expect({ dmCursors, groupCursors, inboxLastReadAt }).toEqual(READ_STATE_INITIAL);
  });
});
