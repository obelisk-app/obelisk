'use client';

/**
 * Mobile shell for /app: full-screen, single-pane experience that runs
 * underneath the 1024px desktop breakpoint, wired to the existing Nostr bridge. The screens
 * live in `./screens`, the overlays in `./sheets`, the screen table in
 * `./carousel/MobileScreenBody` and `./carousel/TopLevelScreen`, the carousel
 * in `./carousel/MobileScreensHost`. State, navigation and the browser
 * history are `usePhoneShell`; this file renders the frame.
 */

import ProfilePopover from '@/components/chat/profile/ProfilePopover';
import HintHost from '@/components/hints/HintHost';
import MessageZapModal from '@/components/chat/zaps/MessageZapModal';
import { usePhoneShell } from '@/hooks/shell/mobile/nav/usePhoneShell';
import { LazyGameModalHost } from '../mounts/lazy-mounts';
import { BottomNav } from './chrome/BottomNav';
import { MobileVoiceStatusSlot } from './chrome/MobileVoiceStatusSlot';
import { MobileScreensHost } from './carousel/MobileScreensHost';
import { LoginScreen } from './screens/login/LoginScreen';
import { RehydratingScreen } from './screens/status/RehydratingScreen';
// CSS is hoisted to AppGate.tsx so it lands in the route's eagerly-loaded
// stylesheet, not in this dynamic chunk's late-arriving sidecar.

export default function MobileShell() {
  const { dragLayerRef, screensHostRef, ...vm } = usePhoneShell();

  // Guests: full-screen login
  if (!vm.isLoggedIn) {
    return (
      <div className="obelisk-mobile" data-obelisk-app>
        <div className="screens-host">
          {vm.isRehydrating ? <RehydratingScreen /> : <LoginScreen />}
        </div>
      </div>
    );
  }

  return (
    <div
      className="obelisk-mobile"
      data-obelisk-app
      style={vm.kbStyle}
      onTouchStart={vm.carousel.onTouchStart}
      onTouchMove={vm.carousel.onTouchMove}
      onTouchEnd={vm.carousel.onTouchEnd}
      onTouchCancel={vm.carousel.onTouchCancel}
    >
      <MessageZapModal />
      <LazyGameModalHost />
      <MobileScreensHost
        hostRef={screensHostRef}
        dragLayerRef={dragLayerRef}
        isDragging={vm.carousel.isDragging}
        nav={vm.nav}
        dragNeighbors={vm.carousel.dragNeighbors}
        screenProps={vm.screenProps}
        slideClass={vm.slideClass}
        closeSheet={vm.closeSheet}
        openZap={vm.screenProps.openZap}
      />
      <MobileVoiceStatusSlot screen={vm.nav.screen} kbInset={vm.kbInset} />
      {!vm.hideNav && <BottomNav nav={vm.nav} onTabPress={vm.carousel.onTabPress} dmBadge={vm.dmBadge} inboxBadge={vm.inboxBadge} />}
      <HintHost surface={vm.hintSurface} shell="mobile" />
      {vm.profilePopupPubkey && (
        <ProfilePopover
          pubkey={vm.profilePopupPubkey}
          onClose={vm.closeProfilePopup}
          onExplore={vm.exploreProfile}
          onMessage={vm.selectPeer}
        />
      )}
    </div>
  );
}
