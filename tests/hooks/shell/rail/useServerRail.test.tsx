import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const removed = vi.hoisted(() => [] as Array<[string, number]>);
vi.mock('@/services/relay/remove-relay', () => ({
  confirmAndRemoveRelay: async (url: string, count: number) => { removed.push([url, count]); },
}));

import { useServerRail } from '@/hooks/shell/rail/useServerRail';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

const wrapper = bridgeWrapper(fakeBridge({ configuredRelays: ['wss://a', 'wss://b'], currentRelayUrl: 'wss://b' }));

describe('useServerRail', () => {
  it('lights the open relay only while the rail is on relays', () => {
    const relay = renderHook(() => useServerRail({ kind: 'relay', url: 'wss://b' }), { wrapper }).result.current;
    expect(relay.relays).toEqual(['wss://a', 'wss://b']);
    expect(relay.isActive('wss://b')).toBe(true);
    expect(relay.isActive('wss://a')).toBe(false);
    const dm = renderHook(() => useServerRail({ kind: 'dm' }), { wrapper }).result.current;
    expect(dm.isActive('wss://b')).toBe(false);
  });

  it('removes through the confirm, telling it how many relays there are', () => {
    const { result } = renderHook(() => useServerRail({ kind: 'dm' }), { wrapper });
    result.current.remove('wss://a');
    expect(removed).toEqual([['wss://a', 2]]);
  });

  it('opens and closes the add-relay dialog', () => {
    const { result } = renderHook(() => useServerRail({ kind: 'dm' }), { wrapper });
    act(() => result.current.openAdd());
    expect(result.current.adding).toBe(true);
    act(() => result.current.closeAdd());
    expect(result.current.adding).toBe(false);
  });
});
