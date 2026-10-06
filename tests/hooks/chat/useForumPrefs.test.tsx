import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_FORUM_PREFS, forumPrefsKey, legacyMobileForumPrefsKey } from '@/services/forum-prefs';
import { useForumPrefs } from '@/hooks/chat/useForumPrefs';

describe('useForumPrefs', () => {
  beforeEach(() => localStorage.clear());

  it('starts from storage and persists updates under the shared key', () => {
    const { result } = renderHook(() => useForumPrefs('f1'));
    expect(result.current.prefs).toEqual(DEFAULT_FORUM_PREFS);
    act(() => result.current.update({ sortBy: 'created' }));
    expect(result.current.prefs.sortBy).toBe('created');
    expect(JSON.parse(localStorage.getItem(forumPrefsKey('f1')) ?? '{}')).toMatchObject({ sortBy: 'created', viewMode: 'list' });
  });

  it('re-reads when the forum changes, without leaking the previous forum\'s choice', () => {
    localStorage.setItem(forumPrefsKey('f2'), JSON.stringify({ sortBy: 'created', viewMode: 'gallery', tagMatch: 'all' }));
    const { result, rerender } = renderHook(({ id }) => useForumPrefs(id), { initialProps: { id: 'f1' } });
    act(() => result.current.update({ tagMatch: 'all' }));
    rerender({ id: 'f2' });
    expect(result.current.prefs).toEqual({ sortBy: 'created', viewMode: 'gallery', tagMatch: 'all' });
    rerender({ id: 'f1' });
    expect(result.current.prefs.tagMatch).toBe('all');
    expect(result.current.prefs.sortBy).toBe('recent');
  });

  it('a phone user\'s old mobile-key choice is what the hook reports', () => {
    localStorage.setItem(legacyMobileForumPrefsKey('f1'), JSON.stringify({ sortBy: 'created', tagMatch: 'any' }));
    const { result } = renderHook(() => useForumPrefs('f1'));
    expect(result.current.prefs.sortBy).toBe('created');
  });
});
