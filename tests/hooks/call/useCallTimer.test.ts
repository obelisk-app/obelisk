import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCallTimer } from '@/hooks/call/useCallTimer';
import { formatElapsed } from '@/utils/format/format-elapsed';

afterEach(() => { vi.useRealTimers(); });

describe('useCallTimer', () => {
  it('shows the time since the call connected and ticks every second', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { result } = renderHook(() => useCallTimer(100_000 - 65_000));
    expect(result.current).toBe(formatElapsed(65_000));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(formatElapsed(66_000));
  });
});
