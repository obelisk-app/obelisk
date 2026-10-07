import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  statuses: {} as Record<string, unknown>,
  listeners: new Set<() => void>(),
  probeRelay: vi.fn(),
  openSettings: vi.fn(),
}));

vi.mock('@/hooks/preferences/usePreferences', () => ({
  usePreferences: () => ({ socialRelays: ['wss://a.example', 'wss://b.example'] }),
}));
vi.mock('@/services/social/relay-status', () => ({
  getRelayStatuses: () => mocks.statuses,
  subscribeRelayStatus: (cb: () => void) => { mocks.listeners.add(cb); return () => mocks.listeners.delete(cb); },
  probeRelay: mocks.probeRelay,
}));
vi.mock('@/utils/settings/open-settings', () => ({ openSettings: mocks.openSettings }));

import { useRelaysWidget } from '@/hooks/social/widgets/useRelaysWidget';

beforeEach(() => {
  mocks.statuses = {};
  mocks.listeners.clear();
  mocks.probeRelay.mockReset();
  mocks.openSettings.mockReset();
});

describe('useRelaysWidget', () => {
  it('lists every social relay, unknown until the watcher reports', () => {
    const { result } = renderHook(() => useRelaysWidget());
    expect(result.current.rows.map((r) => [r.relay, r.state])).toEqual([
      ['wss://a.example', 'unknown'],
      ['wss://b.example', 'unknown'],
    ]);
  });

  it('follows the status store', () => {
    const { result } = renderHook(() => useRelaysWidget());
    act(() => {
      mocks.statuses = { 'wss://b.example': { url: 'wss://b.example', state: 'failed', latencyMs: null, notes: 0, lastChange: 1 } };
      mocks.listeners.forEach((cb) => cb());
    });
    expect(result.current.rows[1].state).toBe('failed');
  });

  it('retries a relay and opens the relay settings', () => {
    const { result } = renderHook(() => useRelaysWidget());
    result.current.retry('wss://a.example');
    expect(mocks.probeRelay).toHaveBeenCalledWith('wss://a.example');
    result.current.manage();
    expect(mocks.openSettings).toHaveBeenCalledWith('relays');
  });
});
