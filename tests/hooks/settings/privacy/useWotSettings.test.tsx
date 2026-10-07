import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const wot = vi.hoisted(() => ({
  state: { enabled: true, maxHops: 2, minPaths: 1, status: 'configured' as 'configured' | 'absent' | 'error' },
  setEnabled: vi.fn(),
  setMaxHops: vi.fn(),
  setMinPaths: vi.fn(),
  refreshStatus: vi.fn(async () => {}),
  initializeWot: vi.fn(),
}));

vi.mock('@/services/wot', () => ({
  initializeWot: wot.initializeWot,
  useWotStore: (selector: (s: Record<string, unknown>) => unknown) => selector({
    ...wot.state,
    setEnabled: wot.setEnabled,
    setMaxHops: wot.setMaxHops,
    setMinPaths: wot.setMinPaths,
    refreshStatus: wot.refreshStatus,
  }),
  wotEngine: { stats: () => ({ allow: 4, deny: 1, pending: 0 }), on: () => () => {} },
}));

import { useWotSettings } from '@/hooks/settings/privacy/useWotSettings';

beforeEach(() => {
  vi.clearAllMocks();
  wot.state.enabled = true;
  wot.state.status = 'configured';
});

describe('useWotSettings', () => {
  it('starts the probe, reads the counts, and drives the store', () => {
    const { result } = renderHook(() => useWotSettings());
    expect(wot.initializeWot).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(true);
    expect(result.current.stats).toEqual({ allow: 4, deny: 1, pending: 0 });
    act(() => result.current.toggle());
    expect(wot.setEnabled).toHaveBeenCalledWith(false);
    act(() => result.current.setMaxHops('3'));
    act(() => result.current.setMinPaths('2'));
    expect(wot.setMaxHops).toHaveBeenCalledWith(3);
    expect(wot.setMinPaths).toHaveBeenCalledWith(2);
    act(() => result.current.recheck());
    expect(wot.refreshStatus).toHaveBeenCalled();
  });

  it('is never active without the extension, whatever the switch says', () => {
    wot.state.status = 'absent';
    const { result } = renderHook(() => useWotSettings());
    expect(result.current.canEnable).toBe(false);
    expect(result.current.active).toBe(false);
    expect(result.current.status.labelKey).toBe('settings.wot.status.missing');
  });
});
