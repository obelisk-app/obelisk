'use client';

import { useSyncExternalStore } from 'react';
import {
  useIsLoggedIn,
  useIsRehydrating,
  useConnectionState,
  useCurrentRelayUrl,
} from '@/services/nostr-bridge';
import HintHost from '@/components/hints/HintHost';
import ProfilePopover from '@/components/chat/profile/ProfilePopover';
import BackgroundVoiceAudio from '@/components/voice/audio/BackgroundVoiceAudio';
import { useChatStore } from '@/store/chat';
import MessageZapModal from '@/components/chat/zaps/MessageZapModal';
import { LazyDmCallLayer, LazyGameModalHost } from '../mounts/lazy-mounts';
import { RelayAccessModal } from '../modals/relay/RelayAccessModal';
import { FloatingUserPanel } from '../panes/sidebar/FloatingUserPanel';
import { ProfilePane } from '../panes/reader/ProfilePane';
import { RelayTopBar } from '../panes/topbar/RelayTopBar';
import {
  DirectMessageSubscriptionAnchor,
  MobileVoiceStatusBar,
  RehydratingScreen,
} from './ShellStates';
import { useEdgeSwipeOpen } from '@/hooks/shell/desktop/useEdgeSwipeOpen';
import { surfaceForView } from '@/utils/shell/desktop/view';
import { DesktopDrawer } from './DesktopDrawer';
import { DesktopMain } from './DesktopMain';
import { FeedSplitPane } from './FeedSplitPane';
import { LoggedOutScreen } from './LoggedOutScreen';
import { ReaderPaneSlot } from './ReaderPaneSlot';
import { PROFILE_PANE_KEY, railModeFor } from '@/utils/shell/desktop/desktop-layout';
import { useDesktopChrome, useFeedPane } from '@/hooks/shell/desktop/useDesktopLayout';
import { useDesktopNavigation } from '@/hooks/shell/desktop/useDesktopNavigation';
import { useExploredProfile, useReaderPane } from '@/hooks/shell/desktop/useShellPanes';

/** "Is this the client" never changes for the life of the document. */
const subscribeToNothing = () => () => {};
const readTrue = () => true;
const readFalse = () => false;

/**
 * The desktop chat shell. A skin: navigation, panes and layout state live in
 * the hooks under `./shell/`, chat behaviour in `src/hooks/chat/`.
 */
export default function AppShell() {
  const isLoggedIn = useIsLoggedIn();
  const isRehydrating = useIsRehydrating();
  const conn = useConnectionState();
  const relay = useCurrentRelayUrl();
  const profilePopupPubkey = useChatStore((state) => state.profilePopupPubkey);
  const closeProfilePopup = useChatStore((state) => state.closeProfilePopup);
  const chrome = useDesktopChrome();
  const { setSidebarOpen } = chrome;
  const nav = useDesktopNavigation(relay, setSidebarOpen);
  const { view, setView } = nav;
  const feed = useFeedPane(view, setView, nav.lastGroupId);
  // True once this tree is running on the client. During hydration the
  // server snapshot (false) is used for the first render, which is the
  // mismatch guard the LoginModal needs (see below); a client-only mount
  // reads true straight away instead of spending a render on `null`.
  const mounted = useSyncExternalStore(subscribeToNothing, readTrue, readFalse);
  // Both hold hooks (`useHistoryDismiss`), so both sit above the
  // `!isLoggedIn` early return; see `hooks-after-early-return.test.ts`.
  const reader = useReaderPane();
  const profile = useExploredProfile();
  const edgeSwipe = useEdgeSwipeOpen(!chrome.sidebarOpen, () => setSidebarOpen(true));

  if (!isLoggedIn) {
    // A stored session is being reconnected (cold load → relay handshake +
    // optional NIP-46 bunker pre-warm). Show a connecting screen instead of
    // the LoginModal so the user isn't told they're logged out when they're
    // not. See `useIsRehydrating` and docs/data-system.md §3.
    if (isRehydrating) return <RehydratingScreen />;
    // Defer LoginModal until after mount: the underlying nui Modal portal +
    // a NIP-07 extension that injects DOM before React hydrates produce a
    // server/client mismatch on the modal-overlay div. Rendering a no-op
    // placeholder for the first paint sidesteps the hydration warning.
    if (!mounted) return null;
    return <LoggedOutScreen />;
  }

  const closeDrawer = () => setSidebarOpen(false);
  const leaveDms = () => {
    setView({ kind: 'empty' });
    closeDrawer();
  };
  const onToggleFeed = () => {
    closeDrawer();
    feed.toggle();
  };
  const { exploredProfilePubkey, setExploredProfilePubkey } = profile;

  return (
    <div
      className="obelisk-desktop-bg flex w-screen flex-col overflow-hidden text-lc-white"
      data-obelisk-app
      style={{ height: '100dvh' }}
      {...edgeSwipe}
    >
      <MessageZapModal />
      <LazyGameModalHost />
      <RelayAccessModal />
      <BackgroundVoiceAudio />
      <DirectMessageSubscriptionAnchor />
      <LazyDmCallLayer />
      <RelayTopBar
        relay={relay}
        onSocialSurface={view.kind === 'feed'}
        onOpenSidebar={() => setSidebarOpen(true)}
        onJumpToChannel={(channelId) => setView({ kind: 'group', groupId: channelId })}
        onJumpToDm={(peer) => setView({ kind: 'dm', peer })}
      />
      <MobileVoiceStatusBar currentView={view} />
      <div className="flex flex-1 overflow-hidden relative min-h-0">
        <DesktopDrawer
          relay={relay}
          conn={conn}
          view={view}
          setView={setView}
          railMode={railModeFor(view, feed.splitFeed, relay)}
          sidebarOpen={chrome.sidebarOpen}
          closeDrawer={closeDrawer}
          leaveDms={leaveDms}
          onToggleFeed={onToggleFeed}
          onSidebarWidth={chrome.setSidebarWidth}
        />
        <DesktopMain
          view={view}
          setView={setView}
          showMembers={exploredProfilePubkey ? false : chrome.showMembers}
          onToggleMembers={() => chrome.setShowMembers((v) => !v)}
          pendingMessageId={nav.pendingMessageId}
          onConsumePendingMessageId={() => nav.setPendingMessageId(null)}
          leaveDms={leaveDms}
          feed={feed}
          onOpenProfile={setExploredProfilePubkey}
          openThread={reader.openThread}
          openArticle={reader.openArticle}
        />
        {feed.splitFeed && <FeedSplitPane feed={feed} onOpenProfile={setExploredProfilePubkey} />}
        {reader.paneOpen && (
          <ReaderPaneSlot
            article={reader.paneArticle}
            threadNoteId={reader.threadNoteId}
            full={reader.paneFull}
            setFull={reader.setPaneFull}
            onBack={reader.dismissPane}
            onOpenProfile={setExploredProfilePubkey}
            pushThread={reader.pushThread}
          />
        )}
        {exploredProfilePubkey && (
          <ProfilePane
            pubkey={exploredProfilePubkey}
            full={profile.profileFull}
            storageKey={PROFILE_PANE_KEY}
            onToggleFull={profile.setProfileFull}
            onBack={profile.dismissProfile}
            onClose={profile.closeProfile}
            onOpenProfile={setExploredProfilePubkey}
            onMessage={(peer) => { setView({ kind: 'dm', peer }); profile.closeProfile(); }}
          />
        )}
        {profilePopupPubkey && (
          <ProfilePopover
            pubkey={profilePopupPubkey}
            onClose={closeProfilePopup}
            onExplore={setExploredProfilePubkey}
            onMessage={(peer) => setView({ kind: 'dm', peer })}
          />
        )}
        <FloatingUserPanel sidebarWidth={chrome.sidebarWidth} collapsed={view.kind === 'feed'} />
        {/*
          First-run hints for whatever is on screen. Mounted here rather than
          per-view so a hint survives the view changing underneath it, and so
          the "using a control teaches it" listener exists app-wide.
        */}
        <HintHost surface={surfaceForView(view, { feedOpen: feed.feedOpen, exploredProfilePubkey })} shell="desktop" />
      </div>
    </div>
  );
}

