import { StrictMode } from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BridgeProvider } from '@/services/nostr-bridge';
import { useMyPubkey, useSessionActions, useSessionProfile, useNipSigner } from '@/hooks/session/useSession';
import { fakeBridge } from '@tests/support/fake-bridge';
import { userMetadataFixture } from '@tests/support/mocks/nostr-bridge';
import { createSessionController } from '@/services/session/controller';
import type { NipSigner } from '@/types/nostr/nip-signer';
import { STORAGE_KEY, LEGACY_STORAGE_KEY } from '@/constants/nostr-bridge/session';

const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);

describe('session ownership', () => {
  it('shares upstream subscriptions and isolates identity readers from profile updates', () => {
    const bridge = fakeBridge({ myPubkey: ALICE });
    const identitySubscribe = vi.spyOn(bridge, 'subscribeMyPubkey');
    const profileSubscribe = vi.spyOn(bridge, 'subscribeUserMetadata');
    let identityRenders = 0;
    let actionsRenders = 0;
    let profileName: string | null | undefined;
    function Identity() { useMyPubkey(); identityRenders++; return null; }
    function Actions() { useSessionActions(); actionsRenders++; return null; }
    function Profile() { profileName = useSessionProfile()?.name; return null; }
    render(<BridgeProvider bridge={bridge}><Identity /><Identity /><Actions /><Profile /></BridgeProvider>);
    expect(identitySubscribe).toHaveBeenCalledTimes(1);
    expect(profileSubscribe).toHaveBeenCalledTimes(1);
    const before = { identityRenders, actionsRenders };
    act(() => bridge.stores.userMetadata.set({ [ALICE]: userMetadataFixture({ pubkey: ALICE, name: 'Alice' }) }));
    expect(profileName).toBe('Alice');
    expect({ identityRenders, actionsRenders }).toEqual(before);
  });

  it('clears outgoing profile and rejects callbacks from retired subscriptions, including same-account remounts', () => {
    const callbacks: Array<(profile: ReturnType<typeof userMetadataFixture> | null) => void> = [];
    const close = vi.fn();
    const bridge = fakeBridge({ myPubkey: ALICE }, {
      subscribeUserMetadata: (_key, cb) => { callbacks.push(cb); return close; },
    });
    const controller = createSessionController(bridge, true);
    const stop = controller.start();
    callbacks[0](userMetadataFixture({ pubkey: ALICE, name: 'Alice' }));
    bridge.stores.myPubkey.set(BOB);
    expect(controller.getSnapshot().profile).toBeNull();
    callbacks[0](userMetadataFixture({ pubkey: ALICE, name: 'Late Alice' }));
    expect(controller.getSnapshot().profile).toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
    stop();
    const stopAgain = controller.start();
    callbacks[1](userMetadataFixture({ pubkey: BOB, name: 'Retired Bob' }));
    expect(controller.getSnapshot().profile).toBeNull();
    callbacks[2](userMetadataFixture({ pubkey: BOB, name: 'Current Bob' }));
    expect(controller.getSnapshot().profile?.name).toBe('Current Bob');
    stopAgain();
  });

  it('cleans listeners in StrictMode without logging out or disposing the page bridge', () => {
    const logout = vi.fn();
    const dispose = vi.fn();
    const bridge = fakeBridge({}, { logout, dispose });
    const subscribe = vi.spyOn(bridge, 'subscribeMyPubkey');
    let changes = 0;
    function Probe() { useMyPubkey(); changes++; return null; }
    const view = render(<StrictMode><BridgeProvider bridge={bridge}><Probe /></BridgeProvider></StrictMode>);
    expect(subscribe).toHaveBeenCalledTimes(2);
    view.unmount();
    const before = changes;
    act(() => bridge.stores.myPubkey.set(BOB));
    expect(changes).toBe(before);
    expect(logout).not.toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();
  });

  it('ends rehydration when initialization settles even if no account could be restored', () => {
    localStorage.setItem(STORAGE_KEY, '{}');
    const pending = createSessionController(null, false);
    const stop = pending.start();
    expect(pending.getSnapshot().isRehydrating).toBe(true);
    stop();
    const ready = createSessionController(fakeBridge({ isLoggedIn: false, myPubkey: null }), true);
    const stopReady = ready.start();
    expect(ready.getSnapshot().isRehydrating).toBe(false);
    stopReady();
    localStorage.removeItem(STORAGE_KEY);
  });

  it('does not initialize a bridge when identity is read outside a provider', () => {
    expect(renderHook(() => useMyPubkey()).result.current).toBeNull();
  });
  it.each([STORAGE_KEY, LEGACY_STORAGE_KEY])('recognizes saved session %s before bridge adoption', (key) => {
    localStorage.setItem(key, '{}');
    const controller = createSessionController(null, false);
    const stop = controller.start();
    expect(controller.getSnapshot().isRehydrating).toBe(true);
    stop();
    localStorage.removeItem(key);
  });

  it('replaces the signer when the same public key gets a new session', () => {
    let emit: (generation: number) => void = () => {};
    let signer = { pubkey: ALICE } as NipSigner;
    const bridge = fakeBridge({ myPubkey: ALICE }, {
      getNipSigner: () => signer,
      subscribeSessionGeneration: (cb) => { emit = cb; cb(1); return () => {}; },
    });
    const view = renderHook(() => useNipSigner(), {
      wrapper: ({ children }) => <BridgeProvider bridge={bridge}>{children}</BridgeProvider>,
    });
    const first = view.result.current;
    act(() => { signer = { pubkey: ALICE } as NipSigner; emit(2); });
    expect(view.result.current).toBe(signer);
    expect(view.result.current).not.toBe(first);
  });

});
