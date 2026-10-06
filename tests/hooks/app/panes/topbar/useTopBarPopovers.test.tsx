import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useDismissOnOutside } from '@/hooks/app/panes/topbar/useTopBarPopovers';

describe('useDismissOnOutside', () => {
  function mount(open: boolean) {
    const setOpen = vi.fn();
    document.body.innerHTML = '<div data-pop><span id="inside"></span></div><button data-trig id="trigger"></button><p id="outside"></p>';
    renderHook(() => useDismissOnOutside(open, setOpen, 'data-pop', 'data-trig'));
    return setOpen;
  }
  const press = (id: string) => document.getElementById(id)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

  it('closes on a click outside the popover and its trigger', () => {
    const setOpen = mount(true);
    act(() => { press('outside'); });
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it('ignores clicks inside the popover or on the trigger (the trigger toggles itself)', () => {
    const setOpen = mount(true);
    act(() => { press('inside'); press('trigger'); });
    expect(setOpen).not.toHaveBeenCalled();
  });

  it('closes on Escape, and listens for nothing while closed', () => {
    const open = mount(true);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(open).toHaveBeenCalledWith(false);
    const closed = mount(false);
    act(() => { press('outside'); });
    expect(closed).not.toHaveBeenCalled();
  });
});
