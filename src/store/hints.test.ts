import { beforeEach, describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { useHintsStore, ensureHintsStoreForAccount } from './hints';

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
