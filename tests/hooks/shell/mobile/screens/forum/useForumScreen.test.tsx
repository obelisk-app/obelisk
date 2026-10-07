import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { FormEvent } from 'react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useForumScreen } from '@/hooks/shell/mobile/screens/forum/useForumScreen';
import { group } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

const bridge = () => fakeBridge({
  groups: [group({ id: 'f1', kind: 'forum' }), group({ id: 't1', name: 'Hello', parent: 'f1' })],
  childrenByParent: { f1: ['t1'] },
});
const submitEvent = () => ({ preventDefault: vi.fn() }) as unknown as FormEvent;

describe('useForumScreen', () => {
  it('opens the new-thread sheet from a submitted search only when no thread has that name', () => {
    const { result } = renderHook(() => useForumScreen('f1'), { wrapper: bridgeWrapper(bridge()) });
    act(() => result.current.setSearchQuery('hello'));
    const e = submitEvent();
    act(() => result.current.submitSearch(e));
    expect(e.preventDefault).toHaveBeenCalled();
    expect(result.current.showNewThread).toBe(false);
    act(() => result.current.setSearchQuery('  new idea '));
    expect(result.current.query).toBe('new idea');
    act(() => result.current.submitSearch(submitEvent()));
    expect(result.current.showNewThread).toBe(true);
    expect(result.current.prefillTitle).toBe('new idea');
  });

  it('closes the sheet, clears the search and opens the thread once one is created', () => {
    const selectChild = vi.fn();
    const { result } = renderHook(() => useForumScreen('f1', selectChild), { wrapper: bridgeWrapper(bridge()) });
    act(() => result.current.setSearchQuery('x'));
    act(() => result.current.openNewThread('x'));
    act(() => result.current.onThreadCreated('t9'));
    expect(result.current.showNewThread).toBe(false);
    expect(result.current.searchQuery).toBe('');
    expect(selectChild).toHaveBeenCalledWith('t9');
  });
});
