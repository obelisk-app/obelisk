import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { _resetRemoteMediaForTest, setRemoteMediaMode } from '@/services/media/remote-media';
import { useRemoteMediaGate } from '@/hooks/media/remote/useRemoteMediaGate';

const wot = vi.hoisted(() => ({
  distances: new Map<string, number>(),
  listeners: new Set<() => void>(),
}));
vi.mock('@/services/wot/engine', () => ({
  wotEngine: {
    getDistance: (pubkey: string) => wot.distances.get(pubkey) ?? null,
    on: (_event: string, listener: () => void) => {
      wot.listeners.add(listener);
      return () => { wot.listeners.delete(listener); };
    },
  },
}));
const AUTHOR = 'b'.repeat(64);
const notify = () => { for (const listener of wot.listeners) listener(); };

beforeEach(() => {
  wot.distances.clear();
  wot.listeners.clear();
  _resetRemoteMediaForTest();
});

describe('remote media trust updates', () => {
  it('does not repaint a row for unrelated trust verdicts but follows its author verdict', () => {
    let renders = 0;
    const hook = renderHook(() => {
      renders++;
      return useRemoteMediaGate('channel', AUTHOR);
    }, { wrapper: bridgeWrapper(fakeBridge()) });
    expect(hook.result.current.show).toBe(false);
    const before = renders;
    act(() => { wot.distances.set('c'.repeat(64), 2); notify(); });
    expect(renders).toBe(before);
    act(() => { wot.distances.set(AUTHOR, 2); notify(); });
    expect(hook.result.current.show).toBe(true);
    act(() => { wot.distances.delete(AUTHOR); notify(); });
    expect(hook.result.current.show).toBe(false);
  });

  it('switches the selected author and skips trust for followed authors', () => {
    wot.distances.set(AUTHOR, 2);
    const bridge = fakeBridge();
    const hook = renderHook(({ sender }) => useRemoteMediaGate('channel', sender), {
      initialProps: { sender: AUTHOR }, wrapper: bridgeWrapper(bridge),
    });
    expect(hook.result.current.show).toBe(true);
    const stranger = 'c'.repeat(64);
    hook.rerender({ sender: stranger });
    expect(hook.result.current.show).toBe(false);
    act(() => bridge.stores.myContactList.set({
      id: 'contacts', pubkey: 'a'.repeat(64), kind: 3, created_at: 1,
      sig: '', content: '', tags: [['p', stranger]],
    }));
    expect(hook.result.current.show).toBe(true);
    expect(wot.listeners.size).toBe(0);
    act(() => bridge.stores.myContactList.set(null));
    expect(hook.result.current.show).toBe(false);
    expect(wot.listeners.size).toBe(1);
  });

  it('only listens for trust while the policy needs it and cleans up', () => {
    const hook = renderHook(() => useRemoteMediaGate('dm', AUTHOR), { wrapper: bridgeWrapper(fakeBridge()) });
    expect(hook.result.current.show).toBe(false);
    expect(wot.listeners.size).toBe(0);
    act(() => setRemoteMediaMode('dm', 'contacts'));
    expect(wot.listeners.size).toBe(1);
    act(() => hook.result.current.reveal());
    expect(hook.result.current.show).toBe(true);
    act(() => setRemoteMediaMode('dm', 'always'));
    expect(wot.listeners.size).toBe(0);
    hook.unmount();
    expect(wot.listeners.size).toBe(0);
  });
});
