/**
 * `<BridgeProvider>`: one instance per page, the same object for React and
 * for the non-React callers of `getBridgeImpl()`.
 */
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BridgeProvider,
  useAwaitBridge,
  useBridge,
  useBridgeReady,
  useGroups,
  useIsLoggedIn,
  useMyPubkey,
} from '@/services/nostr-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import { getBridgeImpl, registerBridge, unregisterBridge, type BridgeImpl } from '@/services/nostr-bridge/facade/client';

const fake = (name: string) => ({ name }) as unknown as BridgeImpl;

afterEach(() => {
  unregisterBridge();
});

function wrapperFor(bridge?: BridgeImpl, ready?: boolean) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <BridgeProvider bridge={bridge} ready={ready}>{children}</BridgeProvider>;
  };
}

describe('BridgeProvider with an injected bridge', () => {
  it('registers it, so getBridgeImpl() and useBridge() are the same object, and unregisters it on unmount', () => {
    const a = fake('a');
    const { result, unmount } = renderHook(() => ({ fromHook: useBridge(), fromSlot: getBridgeImpl() }), {
      wrapper: wrapperFor(a),
    });
    expect(result.current.fromHook).toBe(a);
    expect(result.current.fromSlot).toBe(a);
    unmount();
    expect(getBridgeImpl()).toBeNull();
  });

  it('is registered before a child effect runs (effects run child first)', () => {
    const a = fake('a');
    const seen: Array<BridgeImpl | null> = [];
    function Child() {
      useEffect(() => {
        seen.push(getBridgeImpl());
      }, []);
      return null;
    }
    render(<BridgeProvider bridge={a}><Child /></BridgeProvider>);
    expect(seen).toEqual([a]);
  });

  it('reports the ready flag it was given, true by default', () => {
    const a = fake('a');
    expect(renderHook(() => useBridgeReady(), { wrapper: wrapperFor(a) }).result.current).toBe(true);
    expect(renderHook(() => useBridgeReady(), { wrapper: wrapperFor(a, false) }).result.current).toBe(false);
  });

  it('leaves a newer registration alone when it unmounts', () => {
    const a = fake('a');
    const b = fake('b');
    const { unmount } = render(<BridgeProvider bridge={a}>{null}</BridgeProvider>);
    registerBridge(b);
    unmount();
    expect(getBridgeImpl()).toBe(b);
  });
});

describe('BridgeProvider in the app (no bridge prop)', () => {
  it('adopts the page bridge getBridge() already holds, reports ready, and keeps it registered after unmount', async () => {
    const page = fake('page');
    registerBridge(page);
    function Probe() {
      const bridge = useBridge();
      const ready = useBridgeReady();
      return <div data-testid="probe">{bridge === page ? 'page' : 'none'}:{String(ready)}</div>;
    }
    const { unmount } = render(<BridgeProvider><Probe /></BridgeProvider>);
    expect(screen.getByTestId('probe').textContent).toBe('none:false');
    await waitFor(() => expect(screen.getByTestId('probe').textContent).toBe('page:true'));
    await act(async () => unmount());
    expect(getBridgeImpl()).toBe(page);
  });
});

describe('useAwaitBridge', () => {
  it('resolves at once with an injected bridge', async () => {
    const a = fake('a');
    const { result } = renderHook(() => useAwaitBridge(), { wrapper: wrapperFor(a) });
    await expect(result.current()).resolves.toBe(a);
  });

  it('waits for the page bridge the provider adopts later, and stays the same function', async () => {
    const page = fake('page');
    registerBridge(page);
    const { result } = renderHook(() => ({ awaitBridge: useAwaitBridge(), now: useBridge() }), {
      wrapper: wrapperFor(),
    });
    // Mounted, not adopted yet: adoption waits for getBridge() to settle.
    expect(result.current.now).toBeNull();
    const first = result.current.awaitBridge;
    const pending = first();
    await act(async () => {
      await Promise.resolve();
    });
    await expect(pending).resolves.toBe(page);
    expect(result.current.now).toBe(page);
    expect(result.current.awaitBridge).toBe(first);
  });
});

describe('outside any provider', () => {
  it('useBridge() is null and useBridgeReady() false, even with a page bridge registered', () => {
    const a = fake('a');
    registerBridge(a);
    expect(renderHook(() => useBridge()).result.current).toBeNull();
    expect(renderHook(() => useBridgeReady()).result.current).toBe(false);
  });

  it('a bridge hook returns its initial value and never creates a bridge', async () => {
    const { result } = renderHook(() => ({ groups: useGroups(), me: useMyPubkey(), in: useIsLoggedIn() }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual({ groups: [], me: null, in: false });
    expect(getBridgeImpl()).toBeNull();
  });

  it('a bridge hook ignores a registered page bridge too: only a provider hands it out', async () => {
    registerBridge(fakeBridge({ groups: [groupFixture({ id: 'g' })] }));
    const { result } = renderHook(() => useGroups());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toEqual([]);
  });

  it('useAwaitBridge() never settles', async () => {
    registerBridge(fake('a'));
    const { result } = renderHook(() => useAwaitBridge());
    let settled = false;
    void result.current().then(() => { settled = true; });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(settled).toBe(false);
  });
});
