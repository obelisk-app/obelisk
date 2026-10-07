import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ watchSentinel: vi.fn() }));
vi.mock('@/services/social/feed-scroll', () => ({ watchSentinel: mocks.watchSentinel }));

import { useInfiniteSentinel } from '@/hooks/social/feed/useInfiniteSentinel';

describe('useInfiniteSentinel', () => {
  it('watches while enabled and calls the latest handler', () => {
    mocks.watchSentinel.mockReset().mockReturnValue(undefined);
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ fn }) => useInfiniteSentinel(fn, false), { initialProps: { fn: first } });
    expect(mocks.watchSentinel).toHaveBeenCalledTimes(1);
    rerender({ fn: second });
    expect(mocks.watchSentinel).toHaveBeenCalledTimes(1);
    mocks.watchSentinel.mock.calls[0][1]();
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });

  it('does not watch while disabled', () => {
    mocks.watchSentinel.mockReset();
    renderHook(() => useInfiniteSentinel(vi.fn(), true));
    expect(mocks.watchSentinel).not.toHaveBeenCalled();
  });
});
