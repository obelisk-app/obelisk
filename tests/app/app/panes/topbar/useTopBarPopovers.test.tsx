import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const fetchRelayInfo = vi.fn();
vi.mock('@/services/relay-info', () => ({
  fetchRelayInfo: (u: string) => fetchRelayInfo(u),
  faviconFor: (u: string) => `${u}/favicon.ico`,
}));

import { useDismissOnOutside, useRelayHeaderInfo } from '@/app/app/panes/topbar/useTopBarPopovers';

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

describe('useRelayHeaderInfo', () => {
  it('uses the NIP-11 icon, else the favicon, and drops it once it fails to load', async () => {
    fetchRelayInfo.mockResolvedValueOnce({ name: 'Relay A' });
    const { result } = renderHook(() => useRelayHeaderInfo('wss://a.example'));
    await waitFor(() => expect(result.current.name).toBe('Relay A'));
    expect(result.current.icon).toBe('wss://a.example/favicon.ico');
    act(() => result.current.onIconError());
    expect(result.current.icon).toBeUndefined();
  });
});
