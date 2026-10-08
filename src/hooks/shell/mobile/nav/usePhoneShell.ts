import { useCallback, useRef, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { useCurrentRelayUrl, useMyFollows, type JsGroup } from '@/services/nostr-bridge';
import { useIsLoggedIn, useIsRehydrating, useMyPubkey } from '@/hooks/session/useSession';
import type { Translate } from '@/i18n/keys';
import { useNotificationBadgeCount } from '@/hooks/notifications/useNotificationSelectors';
import { useTotalDMUnread } from '@/hooks/read-state/useUnreadCounts';
import { useChatStore } from '@/store/chat';
import { useDmOptInEnabled } from '@/hooks/chat/dm/unlock/useDmOptInEnabled';
import { useScreenCarousel } from '@/hooks/shell/mobile/carousel/useScreenCarousel';
import { useKeyboardInset } from '@/hooks/shell/mobile/chrome/useKeyboardInset';
import { useMobileNavActions } from './useMobileNavActions';
import { useMobileNavState } from './useMobileNavState';
import { useMobileHistorySync } from './useMobileHistorySync';
import { useActiveConversationMirror, useExternalNavigation, useMobileReactionSender } from './useMobileShellEvents';
import { slideClassFor } from '@/utils/shell/mobile/carousel-slots';
import { hintSurfaceFor, shouldHideMobileBottomNav } from '@/utils/shell/mobile/bottom-nav';
import type { ScreenName } from '@/utils/shell/mobile/url-state';

export interface MobileMessageContext {
  id: string;
  pubkey: string;
  content: string;
  groupId: string;
  canModerate: boolean;
  canDeleteOwn: boolean;
}

/** Everything a screen may ask the shell to do, plus the two bits of state the tabs read. */
export interface MobileScreenProps {
  readonly t: Translate;
  readonly dmOptInEnabled: boolean;
  readonly myFollows: ReadonlyArray<string>;
  readonly go: (screen: ScreenName, dir?: 'forward' | 'back') => void;
  readonly selectGroup: (groupId: string, kind: JsGroup['kind']) => void;
  readonly selectPeer: (peer: string) => void;
  readonly exploreProfile: (pubkey: string) => void;
  readonly openProfile: (pubkey: string) => void;
  readonly openMembers: () => void;
  readonly openMsgActions: (msg: MobileMessageContext) => void;
  readonly openZap: (msg: { id: string; pubkey: string; content: string }) => void;
  readonly openVoiceChat: () => void;
  readonly backFromChannel: () => void;
  readonly backFromProfile: () => void;
}

/**
 * The phone shell's view model: login state, the navigation state machine
 * and its browser history, the drag carousel, the keyboard inset, the DM and
 * inbox badges, and the actions every screen gets. Navigation state and
 * history are `useMobileNavState` / `useMobileHistorySync`; this wires them.
 */
export function usePhoneShell() {
  const t = useTranslations();
  const isLoggedIn = useIsLoggedIn();
  const isRehydrating = useIsRehydrating();
  const dmOptInEnabled = useDmOptInEnabled();
  const myPubkey = useMyPubkey();
  const myFollows = useMyFollows();
  const serverEmojis = useChatStore((s) => s.serverEmojis);
  const profilePopupPubkey = useChatStore((s) => s.profilePopupPubkey);
  const closeProfilePopup = useChatStore((s) => s.closeProfilePopup);

  const currentRelayUrl = useCurrentRelayUrl();
  const { nav, setNav, navRef, relayRef, slideDir, setSlideDir, pushNav } = useMobileNavState(currentRelayUrl);

  // The drag layer, the screens host and the "mount without a slide" flag are
  // the shell's: it renders the first two and reads the third while rendering.
  const dragLayerRef = useRef<HTMLDivElement>(null);
  const screensHostRef = useRef<HTMLDivElement>(null);
  const suppressSlideRef = useRef(false);
  const carousel = useScreenCarousel({ nav, navRef, relayRef, pushNav, setNav, slideDir, setSlideDir, dragLayerRef, screensHostRef, suppressSlideRef });
  const actions = useMobileNavActions({
    navRef, pushNav, cancelPendingTabTransition: carousel.cancelPendingTabTransition, suppressSlideRef, dmOptInEnabled, myPubkey, closeProfilePopup,
  });

  useExternalNavigation(actions.go, pushNav, currentRelayUrl);
  useMobileHistorySync({
    isLoggedIn, dmOptInEnabled, currentRelayUrl, nav, navRef, relayRef, setNav, setSlideDir, suppressSlideRef,
  });

  // Called unconditionally: the shell returns early for a guest, and React
  // requires the same hook order on every render (logging in or out used to
  // flip the hook count and trip React error #310).
  const kbInset = useKeyboardInset();

  const openVoiceChat = useCallback(() => { pushNav((n) => ({ ...n, screen: 'channel' })); }, [pushNav]);
  const screenProps: MobileScreenProps = {
    t, dmOptInEnabled, myFollows, openVoiceChat,
    go: actions.go, selectGroup: actions.selectGroup, selectPeer: actions.selectPeer, exploreProfile: actions.exploreProfile,
    openProfile: actions.openProfile, openMembers: actions.openMembers, openMsgActions: actions.openMsgActions,
    openZap: actions.openZap, backFromChannel: actions.backFromChannel, backFromProfile: actions.backFromProfile,
  };

  useActiveConversationMirror(nav, dmOptInEnabled);
  // Send the reaction the msg-actions sheet emits.
  useMobileReactionSender(nav.groupId, serverEmojis);

  // Both badges come from the persisted read-state cursor: they survive
  // reloads and converge across tabs via Zustand persist's storage events.
  // The bell counts unread mentions on the ACTIVE relay plus unread DMs;
  // other relays are not scanned while inactive (src/store/notifications/).
  const dmBadge = useTotalDMUnread();
  const inboxBadge = useNotificationBadgeCount(currentRelayUrl);

  return {
    isLoggedIn,
    isRehydrating,
    nav,
    screenProps,
    dragLayerRef,
    screensHostRef,
    carousel,
    closeSheet: actions.closeSheet,
    exploreProfile: actions.exploreProfile,
    selectPeer: actions.selectPeer,
    kbInset,
    /** The on-screen keyboard's height, as the `--kb-inset` the stylesheet lifts the composer by. */
    kbStyle: kbInset > 0 ? ({ ['--kb-inset' as string]: `${kbInset}px` } as CSSProperties) : undefined,
    // Hide the nav when the screen owns the viewport or the keyboard is up.
    hideNav: shouldHideMobileBottomNav(nav.screen, kbInset),
    // eslint-disable-next-line react-hooks/refs -- One-shot flag set synchronously in the same tick as the `pushNav` that triggers this render and cleared by `useScreenCarousel` in a post-commit rAF, so render always sees the value meant for it. Turning it into state means re-plumbing the carousel hook, `useMobileNavActions` and the tests that assert on the ref. Re-examined in audits/obelisk/round9/FIX-lint-warnings.md: no stale read.
    slideClass: slideClassFor(suppressSlideRef.current, slideDir),
    /** The screen id doubles as the hint surface: the registry's surfaces were named after these tabs. */
    hintSurface: hintSurfaceFor(nav.screen),
    dmBadge,
    inboxBadge,
    profilePopupPubkey,
    closeProfilePopup,
  };
}
