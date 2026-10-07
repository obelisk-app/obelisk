import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useForwardedRef } from '@/hooks/common/useForwardedRef';

describe('useForwardedRef', () => {
  it('feeds both its own ref and the caller\'s object ref', () => {
    const caller = createRef<HTMLInputElement>();
    const { result } = renderHook(() => useForwardedRef(caller));
    const node = document.createElement('input');
    result.current.setRef(node);
    expect(result.current.own.current).toBe(node);
    expect(caller.current).toBe(node);
  });

  it('feeds a callback ref, and keeps one callback while the ref is the same', () => {
    const caller = vi.fn();
    const { result, rerender } = renderHook(() => useForwardedRef(caller));
    const first = result.current.setRef;
    rerender();
    expect(result.current.setRef).toBe(first);
    const node = document.createElement('textarea');
    result.current.setRef(node);
    expect(caller).toHaveBeenCalledWith(node);
  });
});
