import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { useForumChrome } from '@/hooks/chat/forum/useForumChrome';

const wrapper = bridgeWrapper(fakeBridge());

describe('useForumChrome', () => {
  it('offers to create only for typed text without an exact match', () => {
    const run = (q: string, exact: boolean) => renderHook(() => useForumChrome(q, exact, [], () => {}), { wrapper }).result.current.canCreate;
    expect(run('', false)).toBe(false);
    expect(run('   ', false)).toBe(false);
    expect(run('idea', false)).toBe(true);
    expect(run('idea', true)).toBe(false);
  });

  it('the All chip is active with no tag selected; isSelected reads the selection', () => {
    const { result } = renderHook(() => useForumChrome('', false, ['t1'], () => {}), { wrapper });
    expect(result.current.allActive).toBe(false);
    expect(result.current.isSelected('t1')).toBe(true);
    expect(result.current.isSelected('t2')).toBe(false);
  });

  it('submit stops the form and runs the search submit', () => {
    const onSubmit = vi.fn();
    const preventDefault = vi.fn();
    const { result } = renderHook(() => useForumChrome('x', false, [], onSubmit), { wrapper });
    act(() => result.current.submit({ preventDefault } as unknown as React.FormEvent));
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
