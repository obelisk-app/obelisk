'use client';

import HintHost from '@/components/hints/HintHost';
import ProfilePopover from '@/components/chat/profile/ProfilePopover';
import MessageZapModal from '@/components/chat/zaps/MessageZapModal';
import { LazyGameModalHost } from '../mounts/lazy-mounts';
import { RelayAccessModal } from '../modals/relay/RelayAccessModal';
import { FloatingUserPanel } from '../panes/sidebar/FloatingUserPanel';
import { ProfilePane } from '../panes/reader/ProfilePane';
import { RelayTopBar } from '../panes/topbar/RelayTopBar';
import { DirectMessageSubscriptionAnchor } from './DirectMessageSubscriptionAnchor';
import { RehydratingScreen } from './ShellStates';
import { DesktopDrawer } from './DesktopDrawer';
import { DesktopMain } from './DesktopMain';
import { FeedSplitPane } from './FeedSplitPane';
import { LoggedOutScreen } from './LoggedOutScreen';
import { ReaderPaneSlot } from './ReaderPaneSlot';
import { PROFILE_PANE_KEY } from '@/constants/shell/desktop';
import { useDesktopShell } from '@/hooks/shell/desktop/useDesktopShell';

/**
 * The desktop chat shell. A skin: navigation, panes and layout state live in
 * `useDesktopShell` (and the hooks under `src/hooks/shell/desktop/`), chat
 * behaviour in `src/hooks/chat/`.
 */
export default function AppShell() {
  const vm = useDesktopShell();
  // A stored session is being reconnected: a connecting screen, not the
  // LoginModal, so the user isn't told they're logged out when they're not.
  // See `useIsRehydrating` and docs/architecture/data-system.md §3.
  if (vm.gate === 'rehydrating') return <RehydratingScreen />;
  // The LoginModal waits for mount (a hydration mismatch guard, see the hook).
  if (vm.gate === 'unmounted') return null;
  if (vm.gate === 'logged-out') return <LoggedOutScreen />;

  return (
    <div
      className="obelisk-desktop-bg flex w-screen flex-col overflow-hidden text-lc-white"
      data-obelisk-app
      style={{ height: '100dvh' }}
      {...vm.edgeSwipe}
    >
      <MessageZapModal />
      <LazyGameModalHost />
      <RelayAccessModal />
      <DirectMessageSubscriptionAnchor />
      <RelayTopBar
        relay={vm.relay}
        onSocialSurface={vm.onSocialSurface}
        onOpenSidebar={vm.openSidebar}
        onJumpToChannel={vm.jumpToChannel}
        onJumpToDm={vm.openDm}
      />
      <div className="flex flex-1 overflow-hidden relative min-h-0">
        <DesktopDrawer
          relay={vm.relay}
          conn={vm.conn}
          view={vm.view}
          setView={vm.setView}
          railMode={vm.railMode}
          sidebarOpen={vm.chrome.sidebarOpen}
          closeDrawer={vm.closeDrawer}
          leaveDms={vm.leaveDms}
          onToggleFeed={vm.toggleFeed}
          onSidebarWidth={vm.chrome.setSidebarWidth}
        />
        <DesktopMain
          view={vm.view}
          setView={vm.setView}
          showMembers={vm.showMembers}
          onToggleMembers={vm.toggleMembers}
          pendingMessageId={vm.nav.pendingMessageId}
          onConsumePendingMessageId={vm.consumePendingMessageId}
          leaveDms={vm.leaveDms}
          feed={vm.feed}
          onOpenProfile={vm.openProfile}
          openThread={vm.reader.openThread}
          openArticle={vm.reader.openArticle}
        />
        {vm.feed.splitFeed && <FeedSplitPane feed={vm.feed} onOpenProfile={vm.openProfile} />}
        {vm.reader.paneOpen && (
          <ReaderPaneSlot
            article={vm.reader.paneArticle}
            threadNoteId={vm.reader.threadNoteId}
            full={vm.reader.paneFull}
            setFull={vm.reader.setPaneFull}
            onBack={vm.reader.dismissPane}
            onOpenProfile={vm.openProfile}
            pushThread={vm.reader.pushThread}
          />
        )}
        {vm.exploredProfilePubkey && (
          <ProfilePane
            pubkey={vm.exploredProfilePubkey}
            full={vm.profile.profileFull}
            storageKey={PROFILE_PANE_KEY}
            onToggleFull={vm.profile.setProfileFull}
            onBack={vm.profile.dismissProfile}
            onClose={vm.profile.closeProfile}
            onOpenProfile={vm.openProfile}
            onMessage={vm.messageFromProfile}
          />
        )}
        {vm.profilePopupPubkey && (
          <ProfilePopover
            pubkey={vm.profilePopupPubkey}
            onClose={vm.closeProfilePopup}
            onExplore={vm.openProfile}
            onMessage={vm.openDm}
          />
        )}
        <FloatingUserPanel sidebarWidth={vm.chrome.sidebarWidth} collapsed={vm.onSocialSurface} />
        {/*
          First-run hints for whatever is on screen. Mounted here rather than
          per-view so a hint survives the view changing underneath it, and so
          the "using a control teaches it" listener exists app-wide.
        */}
        <HintHost surface={vm.hintSurface} shell="desktop" />
      </div>
    </div>
  );
}
