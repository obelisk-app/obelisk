import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/store/chat';
import { useDMStore } from '@/store/dm';
import { useMessageZapStore } from '@/store/messageZap';
import { initialNav, type NavState } from '@/app/app/mobile/url-state';
import { useMobileNavActions } from '@/hooks/app/mobile/useMobileNavActions';

const ME = 'a'.repeat(64);
const BOB = 'b'.repeat(64);

function harness(over: { nav?: NavState; dmOptInEnabled?: boolean } = {}) {
  const navRef = { current: over.nav ?? initialNav };
  const pushNav = vi.fn((updater: (n: NavState) => NavState) => { navRef.current = updater(navRef.current); });
  const cancelPendingTabTransition = vi.fn();
  const suppressSlideRef = { current: false };
  const closeProfilePopup = vi.fn();
  const { result } = renderHook(() => useMobileNavActions({
    navRef, pushNav, cancelPendingTabTransition, suppressSlideRef,
    dmOptInEnabled: over.dmOptInEnabled ?? true, myPubkey: ME, closeProfilePopup,
  }));
  return { actions: result.current, navRef, pushNav, cancelPendingTabTransition, suppressSlideRef, closeProfilePopup };
}

beforeEach(() => {
  useChatStore.setState({ activeChannelId: 'old', isNearBottom: true });
  useDMStore.setState({ activeDMPubkey: 'old' });
  useMessageZapStore.setState({ target: null });
});

describe('useMobileNavActions: channels', () => {
  it('opens a text channel from the server tab and marks it as watched', () => {
    const h = harness();
    h.actions.selectGroup('g1', 'text');
    expect(h.cancelPendingTabTransition).toHaveBeenCalled();
    expect(h.navRef.current).toMatchObject({ screen: 'channel', groupId: 'g1', parentScreen: 'server', dmPeer: null });
    expect(useChatStore.getState()).toMatchObject({ activeChannelId: 'g1', isNearBottom: false });
    expect(useDMStore.getState().activeDMPubkey).toBeNull();
  });

  it('opens a voice room without claiming the channel as watched', () => {
    const h = harness();
    h.actions.selectGroup('v1', 'voice-sfu');
    expect(h.navRef.current).toMatchObject({ screen: 'voice-room', groupId: 'v1', parentScreen: 'server' });
    expect(useChatStore.getState().activeChannelId).toBeNull();
  });

  it('opens a publications channel on the forum screen', () => {
    const h = harness();
    h.actions.selectGroup('f1', 'forum');
    expect(h.navRef.current).toMatchObject({ screen: 'forum', groupId: 'f1', forumGroupId: 'f1' });
    expect(useChatStore.getState().activeChannelId).toBeNull();
  });
});

describe('useMobileNavActions: peers and profiles', () => {
  it('opens a DM thread under the DMs tab and marks the peer as watched', () => {
    const h = harness();
    h.actions.selectPeer(BOB);
    expect(h.navRef.current).toMatchObject({ screen: 'dm-thread', dmPeer: BOB, parentScreen: 'dms-list', groupId: null });
    expect(useDMStore.getState().activeDMPubkey).toBe(BOB);
    expect(useChatStore.getState().activeChannelId).toBeNull();
  });

  it('with DMs off, opens the thread (which shows the opt-in) without watching the peer', () => {
    const h = harness({ dmOptInEnabled: false, nav: { ...initialNav, screen: 'inbox' } });
    h.actions.selectPeer(BOB);
    expect(h.navRef.current).toMatchObject({ screen: 'dm-thread', dmPeer: BOB, parentScreen: 'inbox' });
    expect(useDMStore.getState().activeDMPubkey).toBeNull();
  });

  it('exploreProfile closes the popover and remembers where it came from', () => {
    const h = harness({ nav: { ...initialNav, screen: 'inbox' } });
    h.actions.exploreProfile(BOB);
    expect(h.closeProfilePopup).toHaveBeenCalled();
    expect(h.navRef.current).toMatchObject({ screen: 'profile-view', profilePubkey: BOB, parentScreen: 'inbox' });
  });

  it('openProfile uses the shared anchored popover, not a screen', () => {
    const h = harness();
    h.actions.openProfile(BOB);
    expect(h.pushNav).not.toHaveBeenCalled();
    expect(useChatStore.getState().profilePopupPubkey).toBe(BOB);
  });
});

describe('useMobileNavActions: go and sheets', () => {
  it('go to a top-level tab resets the nav; go to a sub-screen keeps the parent', () => {
    const h = harness({ nav: { ...initialNav, screen: 'channel', groupId: 'g1', parentScreen: 'server' } });
    h.actions.go('search');
    expect(h.navRef.current).toMatchObject({ screen: 'search', groupId: 'g1', parentScreen: 'channel', msgContext: null });
    h.actions.go('feed');
    expect(h.navRef.current).toEqual({ ...initialNav, screen: 'feed' });
    expect(useChatStore.getState().activeChannelId).toBeNull();
  });

  it('go back pops history instead of pushing', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const h = harness();
    h.actions.go('server', 'back');
    expect(back).toHaveBeenCalledTimes(1);
    expect(h.pushNav).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('openMsgActions floats the sheet over the current screen without a lateral slide', () => {
    const h = harness({ nav: { ...initialNav, screen: 'channel', groupId: 'g1', parentScreen: 'server' } });
    const msg = { id: 'm1', pubkey: BOB, content: 'hi', groupId: 'g1', canModerate: false, canDeleteOwn: false };
    h.actions.openMsgActions(msg);
    expect(h.suppressSlideRef.current).toBe(true);
    expect(h.navRef.current).toMatchObject({ screen: 'msg-actions', baseScreen: 'channel', msgContext: msg, parentScreen: 'channel' });
  });

  it('openZap targets the author with an npub label and ignores my own messages', () => {
    const h = harness({ nav: { ...initialNav, screen: 'channel', groupId: 'g1' } });
    h.actions.openZap({ id: 'mine', pubkey: ME, content: 'x' });
    expect(useMessageZapStore.getState().target).toBeNull();
    h.actions.openZap({ id: 'm2', pubkey: BOB, content: 'y' });
    const target = useMessageZapStore.getState().target;
    expect(target).toMatchObject({ messageId: 'm2', recipientPubkey: BOB, groupId: 'g1' });
    expect(target?.displayName).toMatch(/^npub1/);
    expect(target?.displayName).not.toContain('bbbbbbbb');
  });

  it('openZap from the actions sheet closes the sheet', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const h = harness({ nav: { ...initialNav, screen: 'msg-actions', groupId: 'g1', baseScreen: 'channel' } });
    h.actions.openZap({ id: 'm2', pubkey: BOB, content: 'y' });
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });
});
