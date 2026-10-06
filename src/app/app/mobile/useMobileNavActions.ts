'use client';

/**
 * What the phone's screens ask the shell to do: open a channel, a peer, a
 * profile, the member list, the message-actions sheet or the zap sheet, and
 * go back. Every action is a `pushNav` with the right `NavState` shape and
 * the matching chat/dm store mirror, so the read-state gates know where the
 * user is. The shell owns `pushNav`; this hook owns the shapes.
 *
 * We update `useChatStore.activeChannelId` / `useDMStore.activeDMPubkey`
 * via `setState` rather than calling the slice's `setActiveChannel` /
 * `setActiveDM` actions: those actions ALSO blow away `messages` and
 * re-flip `isLoadingMessages: true`, which is fine for the desktop chat
 * panel (its source of truth) but would be redundant churn on mobile,
 * where messages come from the bridge hook instead. We only need the
 * active id so `read-gates.isUserWatching*` knows the user is here.
 */
import { useCallback, type RefObject } from 'react';
import type { JsGroup } from '@/services/nostr-bridge';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { useChatStore } from '@/store/chat';
import { useDMStore } from '@/store/dm';
import { useMessageZapStore } from '@/store/messageZap';
import { type ScreenName, type NavState, initialNav } from './url-state';
import { NAV_ORDER } from './swipe-nav';

export interface MobileNavActionInputs {
  readonly navRef: RefObject<NavState>;
  readonly pushNav: (updater: (n: NavState) => NavState, dir?: 'forward' | 'back') => void;
  readonly cancelPendingTabTransition: () => void;
  readonly suppressSlideRef: RefObject<boolean>;
  readonly dmOptInEnabled: boolean;
  readonly myPubkey: string | null;
  readonly closeProfilePopup: () => void;
}

export function useMobileNavActions({
  navRef, pushNav, cancelPendingTabTransition, suppressSlideRef, dmOptInEnabled, myPubkey, closeProfilePopup,
}: MobileNavActionInputs) {
  const go = useCallback((screen: ScreenName, dir: 'forward' | 'back' = 'forward') => {
    if (dir === 'back' && typeof window !== 'undefined') {
      window.history.back();
      return;
    }
    cancelPendingTabTransition();
    // Profile → Preferences used to be a tab switch inside one screen and
    // suppressed the slide. It's a real navigation now (gear in, arrow
    // back), so it animates like every other push.

    if (screen !== 'channel') useChatStore.setState({ activeChannelId: null });
    if (screen !== 'dm-thread') useDMStore.setState({ activeDMPubkey: null });
    pushNav((n) => {
      if (NAV_ORDER.includes(screen)) return { ...initialNav, screen };
      return {
        ...n,
        screen,
        baseScreen: null,
        msgContext: null,
        // Sub-screen targets record where we came from so the bottom-nav
        // highlight + swipe-back behave correctly for screens reachable from
        // multiple tabs (search, etc).
        parentScreen: n.screen,
      };
    }, dir);
  }, [cancelPendingTabTransition, pushNav]);

  const selectGroup = useCallback((groupId: string, kind: JsGroup['kind']) => {
    cancelPendingTabTransition();
    if (kind === 'voice' || kind === 'voice-sfu') {
      useChatStore.setState({ activeChannelId: null });
      useDMStore.setState({ activeDMPubkey: null });
      pushNav((n) => ({
        ...n,
        screen: 'voice-room',
        groupId,
        dmPeer: null,
        profilePubkey: null,
        forumGroupId: null,
        baseScreen: null,
        msgContext: null,
        parentScreen: 'server',
      }));
    } else if (kind === 'forum') {
      useChatStore.setState({ activeChannelId: null });
      useDMStore.setState({ activeDMPubkey: null });
      pushNav((n) => ({
        ...n,
        screen: 'forum',
        groupId,
        forumGroupId: groupId,
        dmPeer: null,
        profilePubkey: null,
        baseScreen: null,
        msgContext: null,
        parentScreen: 'server',
      }));
    } else {
      // Pure navigation. The cursor is advanced by `useAutoMarkRead` once the
      // user is actually watching the channel (visible + focused + active).
      useChatStore.setState({ activeChannelId: groupId, isNearBottom: false });
      useDMStore.setState({ activeDMPubkey: null });
      pushNav((n) => ({
        ...n,
        screen: 'channel',
        groupId,
        dmPeer: null,
        profilePubkey: null,
        forumGroupId: null,
        baseScreen: null,
        msgContext: null,
        parentScreen: 'server',
      }));
    }
  }, [cancelPendingTabTransition, pushNav]);
  const selectPeer = useCallback((peer: string) => {
    cancelPendingTabTransition();
    if (!dmOptInEnabled) {
      useChatStore.setState({ activeChannelId: null });
      useDMStore.setState({ activeDMPubkey: null });
      pushNav((n) => ({
        ...n,
        screen: 'dm-thread',
        groupId: null,
        dmPeer: peer,
        profilePubkey: null,
        forumGroupId: null,
        baseScreen: null,
        msgContext: null,
        parentScreen: n.screen,
      }));
      return;
    }
    // Pure navigation. The cursor is advanced by `useAutoMarkRead` once the
    // DM thread is open, focused, and visible.
    useChatStore.setState({ activeChannelId: null });
    useDMStore.setState({ activeDMPubkey: peer });
    pushNav((n) => ({
      ...n,
      screen: 'dm-thread',
      groupId: null,
      dmPeer: peer,
      profilePubkey: null,
      forumGroupId: null,
      baseScreen: null,
      msgContext: null,
      parentScreen: 'dms-list',
    }));
  }, [cancelPendingTabTransition, dmOptInEnabled, pushNav]);
  // Cross-context screens: stamp parentScreen with the current screen so the
  // bottom-nav highlight + swipe direction reflect where the user came from.
  // E.g. profile-view from Inbox keeps Inbox as parent; from a channel keeps
  // 'channel' (which resolveParent walks up to 'server'). See
  // docs/mobile-navigation.md §3.
  const openProfile = useCallback((pubkey: string) => {
    useChatStore.getState().openProfilePopup(pubkey);
  }, []);
  const exploreProfile = useCallback((pubkey: string) => {
    closeProfilePopup();
    pushNav((n) => ({ ...n, screen: 'profile-view', profilePubkey: pubkey, parentScreen: n.screen }));
  }, [closeProfilePopup, pushNav]);
  const openMembers = useCallback(() => {
    pushNav((n) => ({ ...n, screen: 'member-list', parentScreen: n.screen }));
  }, [pushNav]);
  const openMsgActions = useCallback((msg: {
    id: string;
    pubkey: string;
    content: string;
    groupId: string;
    canModerate: boolean;
    canDeleteOwn: boolean;
  }) => {
    // The sheet animates in vertically on top of the base screen - suppress the
    // default forward slide so the underlying channel doesn't lateral-slide too.
    suppressSlideRef.current = true;
    pushNav((n) => ({ ...n, baseScreen: n.screen, screen: 'msg-actions', msgContext: msg, parentScreen: n.screen }));
  }, [pushNav, suppressSlideRef]);
  const closeSheet = useCallback(() => {
    if (typeof window !== 'undefined') window.history.back();
  }, []);
  const openSharedZap = useMessageZapStore((s) => s.open);
  const openZap = useCallback((msg: { id: string; pubkey: string; content: string }) => {
    const groupId = navRef.current.groupId;
    if (!groupId || msg.pubkey === myPubkey) return;
    openSharedZap({
      messageId: msg.id,
      recipientPubkey: msg.pubkey,
      recipientLud16: null,
      displayName: shortNpubLabel(msg.pubkey),
      groupId,
    });
    if (navRef.current.screen === 'msg-actions' || navRef.current.screen === 'zap-modal') {
      closeSheet();
    }
  }, [closeSheet, myPubkey, openSharedZap, navRef]);
  const backFromChannel = useCallback(() => {
    if (typeof window !== 'undefined') window.history.back();
  }, []);
  const backFromProfile = useCallback(() => {
    if (typeof window !== 'undefined') window.history.back();
  }, []);

  return {
    go, selectGroup, selectPeer, openProfile, exploreProfile, openMembers,
    openMsgActions, closeSheet, openZap, backFromChannel, backFromProfile,
  };
}
