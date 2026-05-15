/**
 * Phase 5 contract: the read-state relay-sync subs are P2 — they must NOT
 * mount until either {@link useGroupMetadataEose} fires OR a 1000ms
 * post-`Connected` grace timer elapses.
 *
 * These tests exercise `useReadyToSync()` in isolation rather than the full
 * `ReadStateRoot` render tree, which depends on many bridge hooks. The hook
 * is the entire gating contract.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockState = {
  groupMetadataEose: false,
  connectionState: 'Disconnected' as string,
};

vi.mock('@/lib/nostr-bridge', () => ({
  useGroupMetadataEose: () => mockState.groupMetadataEose,
  useConnectionState: () => mockState.connectionState,
  useConfiguredRelays: () => [] as string[],
  useGroups: () => [] as { id: string }[],
}));

import { useReadyToSync } from './root';

describe('useReadyToSync', () => {
  beforeEach(() => {
    mockState.groupMetadataEose = false;
    mockState.connectionState = 'Disconnected';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is false before connect and before EOSE', () => {
    const { result } = renderHook(() => useReadyToSync());
    expect(result.current).toBe(false);
  });

  it('flips to true as soon as groupMetadataEose fires', () => {
    const { result, rerender } = renderHook(() => useReadyToSync());
    expect(result.current).toBe(false);
    act(() => {
      mockState.groupMetadataEose = true;
    });
    rerender();
    expect(result.current).toBe(true);
  });

  it('flips to true 1000ms after connectionState becomes Connected (no EOSE path)', () => {
    const { result, rerender } = renderHook(() => useReadyToSync());
    expect(result.current).toBe(false);
    act(() => {
      mockState.connectionState = 'Connected';
    });
    rerender();
    // Still false — grace timer just started.
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it('does NOT flip on the grace timer when the connection drops mid-wait', () => {
    const { result, rerender } = renderHook(() => useReadyToSync());
    act(() => {
      mockState.connectionState = 'Connected';
    });
    rerender();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe(false);
    // Connection drops before 1000ms elapses → timer is cleared.
    act(() => {
      mockState.connectionState = 'Disconnected';
    });
    rerender();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe(false);
  });

  it('returns true if EOSE arrives during the grace window', () => {
    const { result, rerender } = renderHook(() => useReadyToSync());
    act(() => {
      mockState.connectionState = 'Connected';
    });
    rerender();
    expect(result.current).toBe(false);
    act(() => {
      mockState.groupMetadataEose = true;
    });
    rerender();
    expect(result.current).toBe(true);
  });
});
