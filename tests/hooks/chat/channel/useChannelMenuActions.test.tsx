import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { useChannelMenuActions } from '@/hooks/chat/channel/useChannelMenuActions';
import { useChannelActionSheet } from '@/hooks/chat/channel/useChannelActionSheet';
import { useChannelContextMenu } from '@/hooks/chat/channel/useChannelContextMenu';
import { MUTED_FOREVER, getChannelPref, notifyLevel, useChannelPrefsStore } from '@/store/chat/channel-prefs';

const R = 'wss://lacrypta-relay.obelisk.ar';
const target = { relay: R, channelId: 'de8bb87545bea285' };
const wrapper = ({ children }: { children: React.ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;

describe('useChannelMenuActions', () => {
  beforeEach(() => useChannelPrefsStore.getState().reset());

  it('runs each action and then closes the menu', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useChannelMenuActions(target, onClose), { wrapper });
    act(() => result.current.toggleFollow());
    expect(getChannelPref(R, target.channelId).unfollowed).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => result.current.setLevel('all'));
    expect(notifyLevel(getChannelPref(R, target.channelId))).toBe('all');
    act(() => result.current.mute(MUTED_FOREVER));
    expect(result.current.muted).toBe(true);
    expect(result.current.mutedLabel).toBeTruthy();
    act(() => result.current.unmute());
    expect(result.current.muted).toBe(false);
    expect(result.current.mutedLabel).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(4);
  });
});

describe('useChannelActionSheet', () => {
  it('starts on the main view and drills in and out', () => {
    const { result } = renderHook(() => useChannelActionSheet(target, () => {}), { wrapper });
    expect(result.current.view).toBe('main');
    act(() => result.current.showView('notify'));
    expect(result.current.view).toBe('notify');
    act(() => result.current.showView('main'));
    expect(result.current.view).toBe('main');
  });
});

describe('useChannelContextMenu', () => {
  it('opens, toggles and closes a submenu', () => {
    const { result } = renderHook(() => useChannelContextMenu(target, 10, 20, () => {}), { wrapper });
    expect(result.current.sub).toBeNull();
    expect(result.current.pos).toEqual({ left: 10, top: 20 });
    act(() => result.current.openSub('mute'));
    expect(result.current.sub).toBe('mute');
    act(() => result.current.toggleSub('mute'));
    expect(result.current.sub).toBeNull();
    act(() => result.current.toggleSub('notify'));
    expect(result.current.sub).toBe('notify');
    act(() => result.current.toggleSub('mute'));
    expect(result.current.sub).toBe('mute');
    act(() => result.current.closeSub());
    expect(result.current.sub).toBeNull();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    renderHook(() => useChannelContextMenu(target, 0, 0, onClose), { wrapper });
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onClose).toHaveBeenCalled();
  });
});
