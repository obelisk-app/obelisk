import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useMessageActionsSheet } from '@/hooks/shell/mobile/sheets/message/useMessageActionsSheet';
import { REACT_EVENT } from '@/constants/shell/mobile';

const MSG = { id: 'm1', pubkey: 'b'.repeat(64), content: 'hi' };

function setup() {
  const close = vi.fn();
  const { result } = renderHook(() => useMessageActionsSheet(MSG, close), {
    wrapper: bridgeWrapper(fakeBridge({ userMetadata: { [MSG.pubkey]: { name: 'Bea' } as never } })),
  });
  return { result, close };
}

describe('useMessageActionsSheet', () => {
  it('names the author', () => {
    expect(setup().result.current.name).toBe('Bea');
  });

  it('opens the picker for + without closing, and reacts and closes for an emoji', () => {
    const listener = vi.fn();
    window.addEventListener(REACT_EVENT, listener as EventListener);
    try {
      const { result, close } = setup();
      act(() => result.current.quickReact('+'));
      expect(result.current.pickerOpen).toBe(true);
      expect(close).not.toHaveBeenCalled();
      act(() => result.current.closePicker());
      expect(result.current.pickerOpen).toBe(false);
      act(() => result.current.quickReact('👀'));
      expect(listener).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(REACT_EVENT, listener as EventListener);
    }
  });

  it('cannot delete someone else message without moderation', () => {
    expect(setup().result.current.canDelete).toBe(false);
  });
});
