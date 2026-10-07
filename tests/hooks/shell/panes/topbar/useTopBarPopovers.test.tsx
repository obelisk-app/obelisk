import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDismissOnOutside, useInboxStreams } from '@/hooks/shell/panes/topbar/useTopBarPopovers';
import { useReadStateStore } from '@/store/read-state';
import { fakeBridge } from '@tests/support/fake-bridge';
import { messageFixture } from '@tests/support/mocks/nostr-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

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

describe('useInboxStreams, mark read', () => {
  const realMarkAll = useReadStateStore.getState().markAllAsRead;
  afterEach(() => useReadStateStore.setState({ markAllAsRead: realMarkAll }));

  it('advances every channel and DM thread the provider\'s bridge holds, one stream at a time', () => {
    const markAllAsRead = vi.fn();
    useReadStateStore.setState({ markAllAsRead });
    const bridge = fakeBridge({
      messagesByGroup: { g1: [messageFixture({ id: 'm1' })], g2: [] },
      dmsByPeer: { ['p'.repeat(64)]: [] },
    });
    const { result } = renderHook(() => useInboxStreams('wss://relay.test'), { wrapper: bridgeWrapper(bridge) });

    act(() => result.current.handleMarkRead());
    expect(markAllAsRead).toHaveBeenLastCalledWith([], ['g1', 'g2']);

    act(() => result.current.setNotifTab('dms'));
    act(() => result.current.handleMarkRead());
    expect(markAllAsRead).toHaveBeenLastCalledWith(['p'.repeat(64)], []);
  });
});
