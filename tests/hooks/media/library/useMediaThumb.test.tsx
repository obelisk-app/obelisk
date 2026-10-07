import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMediaThumb } from '@/hooks/media/library/useMediaThumb';

describe('useMediaThumb', () => {
  it('marks the failed source broken, reports it, and gives a new source a fresh try', () => {
    const onError = vi.fn();
    const { result, rerender } = renderHook(({ src }) => useMediaThumb(src, onError), { initialProps: { src: 'a.png' } });
    expect(result.current.broken).toBe(false);
    act(() => result.current.failed());
    expect(result.current.broken).toBe(true);
    expect(onError).toHaveBeenCalledTimes(1);
    rerender({ src: 'b.png' });
    expect(result.current.broken).toBe(false);
  });
});
