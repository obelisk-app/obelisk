import { beforeEach, describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { useHintsStore, ensureHintsStoreForAccount, HINTS_STORE_VERSION } from '@/store/hints';
import { CORRUPT_STATES, freshPubkey, readBlob, seedBlob } from './persist-blob';

const reset = () => useHintsStore.setState({ seen: [], muted: false });

beforeEach(() => {
  window.localStorage.clear();
  reset();
});

describe('hints store', () => {
  it('starts with nothing seen', () => {
    expect(useHintsStore.getState().seen).toEqual([]);
    expect(useHintsStore.getState().isSeen('rail-feed')).toBe(false);
  });

  it('marks a hint seen, once', () => {
    const { markSeen } = useHintsStore.getState();
    markSeen('rail-feed');
    markSeen('rail-feed');
    expect(useHintsStore.getState().seen).toEqual(['rail-feed']);
  });

  it('muting stops hints without marking them seen', () => {
    // So "show tips again" brings back everything, not just the ones that
    // happened to be left when the user gave up.
    const { markSeen, muteHints } = useHintsStore.getState();
    markSeen('rail-feed');
    muteHints();

    expect(useHintsStore.getState().muted).toBe(true);
    expect(useHintsStore.getState().seen).toEqual(['rail-feed']);
  });

  it('resets to a brand-new account', () => {
    const { markSeen, muteHints, resetHints } = useHintsStore.getState();
    markSeen('rail-feed');
    muteHints();
    resetHints();

    expect(useHintsStore.getState()).toMatchObject({ seen: [], muted: false });
  });

  it('persists under a per-account key', async () => {
    // A second account on the same device must not inherit the first one's
    // "already seen" and get explained nothing.
    const alice = 'a'.repeat(64);
    ensureHintsStoreForAccount(alice);
    useHintsStore.getState().markSeen('rail-feed');

    await waitFor(() => expect(
      window.localStorage.getItem(`obelisk:hints:${alice}`),
    ).toContain('rail-feed'));
  });

  it('rehydrates a different account separately', async () => {
    // Distinct from the pubkeys above: `createEnsureForAccount` no-ops when
    // asked for the account it already switched to.
    const alice = 'c'.repeat(64);
    const bob = 'd'.repeat(64);
    window.localStorage.setItem(
      `obelisk:hints:${alice}`,
      JSON.stringify({ state: { seen: ['rail-feed'], muted: false }, version: 0 }),
    );

    // Rehydration is async even over synchronous storage.
    ensureHintsStoreForAccount(alice);
    await waitFor(() => expect(useHintsStore.getState().seen).toEqual(['rail-feed']));

    ensureHintsStoreForAccount(bob);
    await waitFor(() => expect(useHintsStore.getState().seen).toEqual([]));
  });
});

describe('hints store saved-data migrations', () => {
  const key = (pk: string) => `obelisk:hints:${pk}`;

  it('a version 0 blob loads as it was and is saved back under the current version', () => {
    const pk = freshPubkey();
    seedBlob(key(pk), { seen: ['rail-feed', 'feed-tab'], muted: true }, 0);
    ensureHintsStoreForAccount(pk);
    expect(useHintsStore.getState().seen).toEqual(['rail-feed', 'feed-tab']);
    expect(useHintsStore.getState().muted).toBe(true);
    expect(readBlob(key(pk))).toEqual({
      state: { seen: ['rail-feed', 'feed-tab'], muted: true },
      version: HINTS_STORE_VERSION,
    });
  });

  it('keeps the valid ids and drops values of the wrong type', () => {
    const pk = freshPubkey();
    seedBlob(key(pk), { seen: ['rail-feed', 7, null], muted: 'yes' }, 0);
    ensureHintsStoreForAccount(pk);
    expect(useHintsStore.getState().seen).toEqual(['rail-feed']);
    expect(useHintsStore.getState().muted).toBe(false);
  });

  it.each(CORRUPT_STATES)('falls back to the defaults on %s', (_label, state, version) => {
    const pk = freshPubkey();
    seedBlob(key(pk), state, version);
    expect(() => ensureHintsStoreForAccount(pk)).not.toThrow();
    expect(useHintsStore.getState().seen).toEqual([]);
    expect(useHintsStore.getState().muted).toBe(false);
  });
});
