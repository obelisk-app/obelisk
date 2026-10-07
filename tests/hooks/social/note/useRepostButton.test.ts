import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRepostButton } from '@/hooks/social/note/useRepostButton';

describe('useRepostButton', () => {
  it('toggles the menu and closes it before reposting or quoting', () => {
    const onRepost = vi.fn();
    const onQuote = vi.fn();
    const { result } = renderHook(() => useRepostButton({ onRepost, onQuote }));
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.repost());
    expect(result.current.open).toBe(false);
    expect(onRepost).toHaveBeenCalledTimes(1);
    act(() => result.current.toggle());
    act(() => result.current.quote());
    expect(onQuote).toHaveBeenCalledTimes(1);
    expect(result.current.open).toBe(false);
    act(() => result.current.toggle());
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
  });
});
