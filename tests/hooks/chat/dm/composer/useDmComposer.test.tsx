import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { useDmComposer } from '@/hooks/chat/dm/composer/useDmComposer';

const PEER = 'b'.repeat(64);
const wrapper = ({ children }: { children: React.ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;
const setup = () => renderHook(() => useDmComposer(PEER, { current: null }), { wrapper });

describe('useDmComposer view helpers', () => {
  it('showSend follows the draft: blank text keeps the voice recorder', () => {
    const { result } = setup();
    expect(result.current.showSend).toBe(false);
    act(() => result.current.typeDraft('   '));
    expect(result.current.showSend).toBe(false);
    act(() => result.current.typeDraft('hi'));
    expect(result.current.showSend).toBe(true);
  });

  it('submit stops the form navigating', () => {
    const { result } = setup();
    const preventDefault = vi.fn();
    act(() => result.current.submit({ preventDefault } as unknown as React.FormEvent));
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it('sendOnEnter takes Enter and leaves Shift+Enter and other keys alone', () => {
    const { result } = setup();
    const key = (k: string, shiftKey = false) => {
      const preventDefault = vi.fn();
      act(() => result.current.sendOnEnter({ key: k, shiftKey, preventDefault } as unknown as React.KeyboardEvent<HTMLInputElement>));
      return preventDefault.mock.calls.length;
    };
    expect(key('Enter')).toBe(1);
    expect(key('Enter', true)).toBe(0);
    expect(key('a')).toBe(0);
  });
});
