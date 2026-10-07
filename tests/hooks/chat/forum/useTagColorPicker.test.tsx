import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTagColorPicker } from '@/hooks/chat/forum/useTagColorPicker';
import { paletteForTag } from '@/utils/chat/forum/forum-tag-colors';

const tag = { id: 'news', name: 'news', emoji: null, color: 'amber' };

describe('useTagColorPicker', () => {
  it('reads the current palette and toggles open', () => {
    const { result } = renderHook(() => useTagColorPicker(tag, () => {}));
    expect(result.current.current).toEqual(paletteForTag(tag));
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
  });

  it('a pick hands the colour over and closes', () => {
    const onPick = vi.fn();
    const { result } = renderHook(() => useTagColorPicker(tag, onPick));
    act(() => result.current.toggle());
    act(() => result.current.pick(null));
    expect(onPick).toHaveBeenCalledWith(null);
    expect(result.current.open).toBe(false);
  });
});
