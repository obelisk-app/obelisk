import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useForumTagsEditor } from '@/hooks/chat/forum/useForumTagsEditor';
import { MAX_FORUM_TAGS } from '@/constants/chat/forum';

const tag = (id: string) => ({ id, name: id, emoji: null, color: null });

describe('useForumTagsEditor', () => {
  it('updates and removes by index', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useForumTagsEditor([tag('a'), tag('b')], onChange));
    result.current.updateAt(1, { name: 'B' });
    expect(onChange).toHaveBeenLastCalledWith([tag('a'), { ...tag('b'), name: 'B' }]);
    result.current.removeAt(0);
    expect(onChange).toHaveBeenLastCalledWith([tag('b')]);
  });

  it('adds a blank tag until the maximum, then does nothing', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useForumTagsEditor([tag('a')], onChange));
    expect(result.current.atMax).toBe(false);
    result.current.addTag();
    expect(onChange.mock.calls[0][0]).toHaveLength(2);
    const full = Array.from({ length: MAX_FORUM_TAGS }, (_, i) => tag(`t${i}`));
    const atMax = renderHook(() => useForumTagsEditor(full, onChange)).result.current;
    expect(atMax.atMax).toBe(true);
    atMax.addTag();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
