/**
 * The real hooks over a fake bridge instance, with no `vi.mock` anywhere:
 * the provider hands the hooks its bridge, so what they return is what that
 * bridge's stores hold, and a store change re-renders them.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGroups, useIsLoggedIn, useLoadEarlier, useMyPubkey, useNipSigner, useUserMetadata } from '@/services/nostr-bridge';
import { getBridgeImpl } from '@/services/nostr-bridge/facade/client';
import type { NipSigner } from '@/constants/nostr/nip-signer';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { groupFixture, userMetadataFixture } from '@tests/support/mocks/nostr-bridge';

const ALICE = 'a'.repeat(64);

describe('bridge hooks under BridgeProvider', () => {
  it('read the seeded stores as soon as they mount', () => {
    const groups = [groupFixture({ id: 'g1' }), groupFixture({ id: 'g2' })];
    const bridge = fakeBridge({ groups, myPubkey: ALICE });
    const { result } = renderHook(() => ({ groups: useGroups(), me: useMyPubkey() }), { wrapper: bridgeWrapper(bridge) });
    expect(result.current.groups.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(result.current.me).toBe(ALICE);
    // The provider registered the fake: nothing built a real bridge.
    expect(getBridgeImpl()).toBe(bridge);
  });

  it('follow the store the way a relay delivery would', () => {
    const bridge = fakeBridge({ isLoggedIn: false });
    const { result } = renderHook(
      () => ({ loggedIn: useIsLoggedIn(), alice: useUserMetadata(ALICE) }),
      { wrapper: bridgeWrapper(bridge) },
    );
    expect(result.current).toEqual({ loggedIn: false, alice: null });
    act(() => {
      bridge.stores.isLoggedIn.set(true);
      bridge.stores.userMetadata.set({ [ALICE]: userMetadataFixture({ pubkey: ALICE, displayName: 'Alice' }) });
    });
    expect(result.current.loggedIn).toBe(true);
    expect(result.current.alice?.displayName).toBe('Alice');
  });

  it('useNipSigner asks the provider\'s bridge', () => {
    const signer = { pubkey: ALICE } as unknown as NipSigner;
    const bridge = fakeBridge({ myPubkey: ALICE }, { getNipSigner: () => signer });
    const { result } = renderHook(() => useNipSigner(), { wrapper: bridgeWrapper(bridge) });
    expect(result.current).toBe(signer);
  });

  it('useLoadEarlier pages through the provider\'s bridge', async () => {
    const loadMoreMessages = vi.fn(async () => 'end' as const);
    const bridge = fakeBridge({}, { loadMoreMessages });
    const { result } = renderHook(() => useLoadEarlier('g1'), { wrapper: bridgeWrapper(bridge) });
    await act(async () => {
      await result.current.loadEarlier();
    });
    expect(loadMoreMessages).toHaveBeenCalledWith('g1');
    expect(result.current.reachedStart).toBe(true);
  });
});
