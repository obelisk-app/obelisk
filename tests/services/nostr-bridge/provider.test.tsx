/**
 * `<BridgeProvider>`: one instance per page, the same object for React and
 * for the non-React callers of `getBridgeImpl()`.
 */
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { BridgeProvider, useBridge, useBridgeReady } from '@/services/nostr-bridge';
import { getBridgeImpl, registerBridge, unregisterBridge, type BridgeImpl } from '@/services/nostr-bridge/client';

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

describe('outside any provider', () => {
  it('useBridge() falls back to getBridgeImpl() until migration step 7', () => {
    expect(renderHook(() => useBridge()).result.current).toBeNull();
    const a = fake('a');
    registerBridge(a);
    expect(renderHook(() => useBridge()).result.current).toBe(a);
  });
});
