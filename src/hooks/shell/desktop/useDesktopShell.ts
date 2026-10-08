'use client';

import { useSyncExternalStore } from 'react';
import { useConnectionState, useCurrentRelayUrl } from '@/services/nostr-bridge';
import { useIsLoggedIn, useIsRehydrating } from '@/hooks/session/useSession';
import { useChatStore } from '@/store/chat';
import { useDesktopChrome, useFeedPane } from '@/hooks/shell/desktop/useDesktopLayout';
import { useDesktopNavigation } from '@/hooks/shell/desktop/useDesktopNavigation';
import { useExploredProfile, useReaderPane } from '@/hooks/shell/desktop/useShellPanes';
import { surfaceForView } from '@/utils/shell/desktop/view';
import { railModeFor } from '@/utils/shell/desktop/desktop-layout';

/** "Is this the client" never changes for the life of the document. */
const subscribeToNothing = () => () => {};
const readTrue = () => true;
const readFalse = () => false;

/** What the desktop shell paints before the chat: reconnecting, nothing yet, or the login screen. */
export type DesktopGate = 'rehydrating' | 'unmounted' | 'logged-out' | 'shell';

/**
 * The desktop chat shell's view model: the session gate, navigation, the
 * sidebar, the feed, reader and profile panes, and the handlers the shell's
 * parts are given. Every hook runs on every render, above the shell's
 * early returns.
 */
export function useDesktopShell() {
  const isLoggedIn = useIsLoggedIn();
  const isRehydrating = useIsRehydrating();
  const conn = useConnectionState();
  const relay = useCurrentRelayUrl();
  const profilePopupPubkey = useChatStore((state) => state.profilePopupPubkey);
  const closeProfilePopup = useChatStore((state) => state.closeProfilePopup);
  const chrome = useDesktopChrome();
  const nav = useDesktopNavigation(relay);
  const { view, setView } = nav;
  const feed = useFeedPane(view, setView, nav.lastGroupId);
  // True once this tree is running on the client. During hydration the
  // server snapshot (false) is used for the first render, which is the
  // mismatch guard the LoginModal needs; a client-only mount reads true
  // straight away instead of spending a render on `null`.
  const mounted = useSyncExternalStore(subscribeToNothing, readTrue, readFalse);
  const reader = useReaderPane();
  const profile = useExploredProfile();
  const { exploredProfilePubkey, setExploredProfilePubkey } = profile;

  const leaveDms = () => {
    setView({ kind: 'empty' });
  };

  // A stored session being reconnected (cold load: relay handshake plus an
  // optional NIP-46 bunker pre-warm) shows a connecting screen rather than
  // telling the user they are logged out. The LoginModal waits for mount:
  // the nui Modal portal plus a NIP-07 extension that injects DOM before
  // React hydrates produce a server/client mismatch on the overlay.
  const gate: DesktopGate = isLoggedIn ? 'shell' : isRehydrating ? 'rehydrating' : mounted ? 'logged-out' : 'unmounted';

  return {
    gate,
    relay,
    conn,
    view,
    setView,
    chrome,
    nav,
    feed,
    reader,
    profile,
    exploredProfilePubkey,
    openProfile: setExploredProfilePubkey,
    profilePopupPubkey,
    closeProfilePopup,
    onSocialSurface: view.kind === 'feed',
    railMode: railModeFor(view, feed.splitFeed, relay),
    showMembers: exploredProfilePubkey ? false : chrome.showMembers,
    hintSurface: surfaceForView(view, { feedOpen: feed.feedOpen, exploredProfilePubkey }),
    leaveDms,
    toggleFeed: feed.toggle,
    toggleMembers: () => chrome.setShowMembers((v) => !v),
    consumePendingMessageId: () => nav.setPendingMessageId(null),
    jumpToChannel: (groupId: string) => setView({ kind: 'group', groupId }),
    openDm: (peer: string | null) => setView({ kind: 'dm', peer }),
    /** "Message" from the explored profile: open the thread and close the pane. */
    messageFromProfile: (peer: string) => {
      setView({ kind: 'dm', peer });
      profile.closeProfile();
    },
  };
}

export type DesktopShellModel = ReturnType<typeof useDesktopShell>;
