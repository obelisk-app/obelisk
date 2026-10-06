'use client';

/**
 * Mobile shell for /app: full-screen, single-pane experience that runs
 * underneath ≤sm viewports, wired to the existing Nostr bridge. The screens live in `./screens`, the
 * overlays in `./sheets`, the screen table in `./MobileScreens`, the
 * carousel in `./MobileScreensHost`; navigation state and the browser
 * history are `useMobileNavState` / `useMobileHistorySync`. This file wires
 * them together and renders the frame.
 */

import { useCallback, useRef } from 'react';
import {
  useIsLoggedIn,
  useIsRehydrating,
  useMyPubkey,
  useMyFollows,
  useCurrentRelayUrl,
} from '@/services/nostr-bridge';
import BackgroundVoiceAudio from '@/components/voice/BackgroundVoiceAudio';
import ProfilePopover from '@/components/chat/ProfilePopover';
import { useTranslation } from '@/i18n/context';

import { useNotificationBadgeCount } from '@/hooks/notifications/useNotificationSelectors';
import { useTotalDMUnread } from '@/hooks/read-state/useUnreadCounts';
import { useChatStore } from '@/store/chat';
import { useDmOptInEnabled } from '@/hooks/dm/useDmOptInEnabled';
import HintHost from '@/components/hints/HintHost';
import MessageZapModal from '@/components/chat/MessageZapModal';
import { useScreenCarousel } from '@/hooks/app/mobile/useScreenCarousel';
import { useMobileNavActions } from '@/hooks/app/mobile/useMobileNavActions';
import { useMobileNavState } from '@/hooks/app/mobile/useMobileNavState';
import { useMobileHistorySync } from '@/hooks/app/mobile/useMobileHistorySync';
import { useActiveConversationMirror, useExternalNavigation, useMobileReactionSender } from '@/hooks/app/mobile/useMobileShellEvents';
import { useKeyboardInset } from '@/hooks/app/mobile/useKeyboardInset';
import { LazyDmCallLayer, LazyGameModalHost } from '../lazy-mounts';
import { BottomNav, hintSurfaceFor, shouldHideMobileBottomNav } from './BottomNav';
import { MobileVoiceStatusSlot } from './MobileVoiceStatusSlot';
import { MobileScreensHost } from './MobileScreensHost';
import { slideClassFor } from './carousel-slots';
import { LoginScreen } from './screens/LoginScreen';
import { RehydratingScreen } from './screens/StatusScreens';
import { renderScreenBody, type MobileScreenProps } from './MobileScreens';
// CSS is hoisted to AppGate.tsx so it lands in the route's eagerly-loaded
// stylesheet, not in this dynamic chunk's late-arriving sidecar.


// ───────────────────────────────────────────────────────────────────────────
// shell - owns nav state

export default function MobileShell() {
  const { t } = useTranslation();
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
  const {
    isDragging, cancelPendingTabTransition, onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, onTabPress, dragNeighbors,
  } = useScreenCarousel({ nav, navRef, relayRef, pushNav, setNav, slideDir, setSlideDir, dragLayerRef, screensHostRef, suppressSlideRef });
  const {
    go, selectGroup, selectPeer, openProfile, exploreProfile, openMembers,
    openMsgActions, closeSheet, openZap, backFromChannel, backFromProfile,
  } = useMobileNavActions({ navRef, pushNav, cancelPendingTabTransition, suppressSlideRef, dmOptInEnabled, myPubkey, closeProfilePopup });

  useExternalNavigation(go, pushNav, currentRelayUrl);
  const { exitToast } = useMobileHistorySync({
    isLoggedIn, dmOptInEnabled, currentRelayUrl, navRef, relayRef, setNav, setSlideDir, suppressSlideRef,
  });

  // Must be called unconditionally - there's an early return for the guest
  // (logged-out) branch further down, and React requires the same hook order
  // on every render. Without hoisting this, logging in/out flips the hook
  // count and trips React error #310.
  const kbInset = useKeyboardInset();


  const openVoiceChat = useCallback(() => { pushNav((n) => ({ ...n, screen: 'channel' })); }, [pushNav]);
  const screenProps: MobileScreenProps = {
    t, dmOptInEnabled, myFollows, go, selectGroup, selectPeer, exploreProfile, openProfile, openMembers,
    openMsgActions, openZap, openVoiceChat, backFromChannel, backFromProfile,
  };

  useActiveConversationMirror(nav, dmOptInEnabled);
  // Listen for reaction emit from msg-actions sheet
  useMobileReactionSender(nav.groupId, serverEmojis);

  // ── DM and inbox badges ─────────────────────────────────────────────
  // Both totals are derived from the persisted read-state cursor; they
  // survive reloads and converge across tabs via Zustand persist's
  // `storage`-event sync.
  const dmBadge = useTotalDMUnread();
  // Bell badge = unread mentions on the ACTIVE relay + unread DMs. Mentions
  // from other relays are not counted because they are not scanned while
  // that relay is inactive - see `src/store/notifications.ts`.
  const inboxBadge = useNotificationBadgeCount(currentRelayUrl);

  // ── render ──────────────────────────────────────────────────────────

  // Guests: full-screen login
  if (!isLoggedIn) {
    return (
      <div className="obelisk-mobile" data-obelisk-app>
        <div className="screens-host">
          {isRehydrating ? <RehydratingScreen /> : <LoginScreen />}
        </div>
      </div>
    );
  }

  const body = renderScreenBody(nav, screenProps);

  // Bottom nav visibility - hide on: profile-view,
  // dm-thread (composer takes the bar role), search/compose-dm/member-list
  // (modal-ish flows), forum (back-nav). Hide nav only when the screen owns
  // the full viewport (sheets float over
  // the previous screen so the nav under them stays meaningful but covered
  // by the sheet backdrop). Also hide when the on-screen keyboard is open
  // so the nav doesn't wedge between the composer and the keyboard.
  // (kbInset is already declared above the guest-branch early return so the
  // hook count stays stable across login state transitions.)
  const hideNav = shouldHideMobileBottomNav(nav.screen, kbInset);

  // eslint-disable-next-line react-hooks/refs -- One-shot flag set synchronously in the same tick as the `pushNav` that triggers this render and cleared by `useScreenCarousel` in a post-commit rAF, so render always sees the value meant for it. Turning it into state means re-plumbing the carousel hook, `useMobileNavActions` and the tests that assert on the ref. Re-examined in audits/obelisk/round9/FIX-lint-warnings.md: no stale read.
  const slideClass = slideClassFor(suppressSlideRef.current, slideDir);
  return (
    <div
      className="obelisk-mobile"
      data-obelisk-app
      style={kbInset > 0 ? ({ ['--kb-inset' as string]: `${kbInset}px` } as React.CSSProperties) : undefined}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      <MessageZapModal />
      <LazyGameModalHost />
      <BackgroundVoiceAudio />
      <LazyDmCallLayer />
      <MobileScreensHost
        hostRef={screensHostRef}
        dragLayerRef={dragLayerRef}
        isDragging={isDragging}
        nav={nav}
        dragNeighbors={dragNeighbors}
        screenProps={screenProps}
        body={body}
        slideClass={slideClass}
        closeSheet={closeSheet}
        openZap={openZap}
      />
      <MobileVoiceStatusSlot screen={nav.screen} kbInset={kbInset} />
      {!hideNav && <BottomNav nav={nav} onTabPress={onTabPress} dmBadge={dmBadge} inboxBadge={inboxBadge} />}
      {/*
        The screen id doubles as the hint surface - the registry's surfaces
        were named after these tabs so one list can serve both shells.
      */}
      <HintHost surface={hintSurfaceFor(nav.screen)} shell="mobile" />
      {exitToast && (
        <div className="mobile-exit-toast" role="status" aria-live="polite">
          {t('mobile.navigation.pressBackAgain')}
        </div>
      )}
      {profilePopupPubkey && (
        <ProfilePopover
          pubkey={profilePopupPubkey}
          onClose={closeProfilePopup}
          onExplore={exploreProfile}
          onMessage={selectPeer}
        />
      )}
    </div>
  );
}
