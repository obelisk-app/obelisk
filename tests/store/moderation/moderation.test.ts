import { describe, it, expect, beforeEach } from 'vitest';
import { useModerationStore, ensureModerationStoreForAccount, MODERATION_STORE_VERSION } from '@/store/moderation';
import { CORRUPT_STATES, freshPubkey, readBlob, seedBlob } from '../persist-blob';

const INITIAL = { mutedPubkeys: [] as string[], blockedPubkeys: [] as string[] };
const X = 'x'.repeat(64);
const Y = 'y'.repeat(64);

const lists = () => {
  const { mutedPubkeys, blockedPubkeys } = useModerationStore.getState();
  return { mutedPubkeys, blockedPubkeys };
};

describe('useModerationStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useModerationStore.setState({ ...INITIAL });
  });

  it('starts with nobody muted or blocked', () => {
    expect(lists()).toEqual(INITIAL);
    expect(useModerationStore.getState().isMuted(X)).toBe(false);
    expect(useModerationStore.getState().isBlocked(X)).toBe(false);
  });

  describe('toggleMute', () => {
    it('adds on first toggle and reports true', () => {
      expect(useModerationStore.getState().toggleMute(X)).toBe(true);
      expect(useModerationStore.getState().isMuted(X)).toBe(true);
      expect(lists().mutedPubkeys).toEqual([X]);
    });

    it('removes on second toggle and reports false', () => {
      useModerationStore.getState().toggleMute(X);
      expect(useModerationStore.getState().toggleMute(X)).toBe(false);
      expect(useModerationStore.getState().isMuted(X)).toBe(false);
      expect(lists().mutedPubkeys).toEqual([]);
    });

    it('keeps other entries when one is removed', () => {
      useModerationStore.getState().toggleMute(X);
      useModerationStore.getState().toggleMute(Y);
      useModerationStore.getState().toggleMute(X);
      expect(lists().mutedPubkeys).toEqual([Y]);
    });
  });

  describe('toggleBlock', () => {
    it('adds on first toggle and reports true', () => {
      expect(useModerationStore.getState().toggleBlock(X)).toBe(true);
      expect(useModerationStore.getState().isBlocked(X)).toBe(true);
      expect(lists().blockedPubkeys).toEqual([X]);
    });

    it('removes on second toggle and reports false', () => {
      useModerationStore.getState().toggleBlock(X);
      expect(useModerationStore.getState().toggleBlock(X)).toBe(false);
      expect(useModerationStore.getState().isBlocked(X)).toBe(false);
    });

    it('is independent of the mute list: blocking does not mute, muting does not block', () => {
      useModerationStore.getState().toggleBlock(X);
      useModerationStore.getState().toggleMute(Y);
      expect(useModerationStore.getState().isMuted(X)).toBe(false);
      expect(useModerationStore.getState().isBlocked(Y)).toBe(false);
      expect(lists()).toEqual({ mutedPubkeys: [Y], blockedPubkeys: [X] });
    });
  });
});

describe('per-account moderation store', () => {
  beforeEach(() => {
    localStorage.clear();
    useModerationStore.setState({ ...INITIAL });
  });

  // The ensure is a module-level no-op for the account it already points
  // at, so every test below uses pubkeys no other test in this file uses.
  const stored = (pubkey: string) =>
    (JSON.parse(localStorage.getItem(`obelisk:moderation:${pubkey}`) ?? 'null') as
      { state: typeof INITIAL } | null)?.state;

  // Storage is synchronous, so no tick is awaited anywhere here: the factory
  // relies on `rehydrate()` settling before it returns.
  it('persists both lists, and only those, under the account key', () => {
    const A = 'a'.repeat(64);
    ensureModerationStoreForAccount(A);
    useModerationStore.getState().toggleMute(X);
    useModerationStore.getState().toggleBlock(Y);
    expect(stored(A)).toEqual({ mutedPubkeys: [X], blockedPubkeys: [Y] });
  });

  it('loads an account that already has a mute list', () => {
    const A = 'b'.repeat(64);
    localStorage.setItem(
      `obelisk:moderation:${A}`,
      JSON.stringify({ state: { mutedPubkeys: [X], blockedPubkeys: [] }, version: 0 }),
    );
    ensureModerationStoreForAccount(A);
    expect(useModerationStore.getState().isMuted(X)).toBe(true);
    expect(useModerationStore.getState().isBlocked(X)).toBe(false);
  });

  it("a second account never sees the first account's mutes and blocks, and the first survives the round trip", () => {
    const A = 'c'.repeat(64);
    const B = 'd'.repeat(64);

    ensureModerationStoreForAccount(A);
    useModerationStore.getState().toggleMute(X);
    useModerationStore.getState().toggleBlock(Y);
    const aLists = lists();
    expect(stored(A)).toEqual(aLists);

    // B has nothing stored. zustand's rehydrate() merges, so without the
    // factory's clear B would come up with A's mute and block lists in
    // memory, `syncMutesToEngine` would apply them to B's session, and B's
    // first toggle would persist A's lists under B's key. One user's
    // blocklist becoming another's is a privacy fault, not just a bug.
    ensureModerationStoreForAccount(B);
    expect(lists()).toEqual(INITIAL);
    expect(useModerationStore.getState().isMuted(X)).toBe(false);
    expect(useModerationStore.getState().isBlocked(Y)).toBe(false);
    // ...and the switch itself wrote nothing to A's key.
    expect(stored(A)).toEqual(aLists);

    // B's own toggle lands under B's key only, and carries none of A's.
    useModerationStore.getState().toggleMute(Y);
    expect(stored(B)).toEqual({ mutedPubkeys: [Y], blockedPubkeys: [] });
    expect(stored(A)).toEqual(aLists);

    // Back to A: A's lists come up intact, with nothing of B's in them.
    ensureModerationStoreForAccount(A);
    expect(lists()).toEqual(aLists);
    expect(useModerationStore.getState().isMuted(Y)).toBe(false);
  });

  it('detaching (logout) resets memory and stops writes reaching the account key', () => {
    const A = 'e'.repeat(64);
    ensureModerationStoreForAccount(A);
    useModerationStore.getState().toggleMute(X);
    const aLists = lists();

    ensureModerationStoreForAccount(null);
    expect(lists()).toEqual(INITIAL);
    useModerationStore.getState().toggleBlock(Y);
    expect(stored(A)).toEqual(aLists);
  });
});

describe('moderation store saved-data migrations', () => {
  const key = (pk: string) => `obelisk:moderation:${pk}`;

  it('a version 0 blob keeps its mutes and blocks and is saved back under the current version', () => {
    const pk = freshPubkey();
    seedBlob(key(pk), { mutedPubkeys: [X], blockedPubkeys: [Y] }, 0);
    ensureModerationStoreForAccount(pk);
    expect(lists()).toEqual({ mutedPubkeys: [X], blockedPubkeys: [Y] });
    expect(readBlob(key(pk))?.version).toBe(MODERATION_STORE_VERSION);
  });

  it('drops entries that are not pubkey strings', () => {
    const pk = freshPubkey();
    seedBlob(key(pk), { mutedPubkeys: [X, 42, { p: Y }], blockedPubkeys: 'all' }, 0);
    ensureModerationStoreForAccount(pk);
    expect(lists()).toEqual({ mutedPubkeys: [X], blockedPubkeys: [] });
  });

  it.each(CORRUPT_STATES)('falls back to the defaults on %s', (_label, state, version) => {
    const pk = freshPubkey();
    seedBlob(key(pk), state, version);
    expect(() => ensureModerationStoreForAccount(pk)).not.toThrow();
    expect(lists()).toEqual(INITIAL);
  });
});
