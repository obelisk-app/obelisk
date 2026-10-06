import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useForumCollapsed } from '@/app/app/mobile/screens/server/useServerScreenState';

describe('useForumCollapsed', () => {
  beforeEach(() => { localStorage.clear(); });

  it('starts from the flags desktop left in localStorage', () => {
    localStorage.setItem('obelisk-dex/forum-collapsed/f1', '1');
    localStorage.setItem('obelisk-dex/forum-collapsed/f2', '0');
    const { result } = renderHook(() => useForumCollapsed());
    expect(result.current.forumCollapsed).toEqual({ f1: true });
  });

  it('writes a collapse and removes the key on expand', () => {
    const { result } = renderHook(() => useForumCollapsed());
    act(() => result.current.toggleForumCollapsed('f3'));
    expect(localStorage.getItem('obelisk-dex/forum-collapsed/f3')).toBe('1');
    act(() => result.current.toggleForumCollapsed('f3'));
    expect(localStorage.getItem('obelisk-dex/forum-collapsed/f3')).toBeNull();
  });
});
