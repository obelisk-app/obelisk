'use client';

import { useEffect, useState } from 'react';
import {
  INITIAL_FEED_PANE,
  closeFeed,
  expandFeed,
  restoreFeed,
  toggleFeed,
  type FeedPaneState,
} from '@/utils/shell/feed-pane';
import type { View } from '@/utils/shell/view';
import {
  SHOW_MEMBERS_KEY,
  SIDEBAR_KEY,
  feedHostFor,
  readSidebarWidth,
  viewForFeedPane,
} from '@/utils/shell/desktop-layout';

/** Drawer open state, the sidebar width and the member list toggle, remembered. */
export function useDesktopChrome() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 264;
    return readSidebarWidth(window.localStorage.getItem(SIDEBAR_KEY));
  });
  const [showMembers, setShowMembers] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const v = window.localStorage.getItem(SHOW_MEMBERS_KEY);
    return v === null ? true : v === '1';
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SHOW_MEMBERS_KEY, showMembers ? '1' : '0');
  }, [showMembers]);
  return { sidebarOpen, setSidebarOpen, sidebarWidth, setSidebarWidth, showMembers, setShowMembers };
}

/**
 * The feed alongside a group, rather than instead of it.
 *
 * Reading the wider network while a room is live is a normal thing to want,
 * and the old in-chat Chat/Feed tabs made it exclusive. The rail button is
 * a plain open/close toggle; size is the pane's own ⤢ / ⤡, because three
 * states behind one control meant you had to press it to find out what it
 * would do. See `feed-pane.ts`.
 */
export function useFeedPane(view: View, setView: (v: View) => void, lastGroupId: string | null) {
  const [feedPane, setFeedPane] = useState<FeedPaneState>(INITIAL_FEED_PANE);
  const feedOpen = feedPane.open;
  const splitFeed = feedOpen && feedPane.mode === 'split' && view.kind === 'group';
  const feedHost = feedHostFor(view, lastGroupId);

  /** Pane state is the source of truth; `view` is synced from it. */
  const applyFeedPane = (next: FeedPaneState) => {
    setFeedPane(next);
    const nextView = viewForFeedPane(next, view, feedHost);
    if (nextView) setView(nextView);
  };

  return {
    feedPane,
    feedOpen,
    splitFeed,
    feedHost,
    toggle: () => applyFeedPane(toggleFeed(feedPane, feedHost)),
    expand: () => applyFeedPane(expandFeed(feedPane)),
    restore: () => applyFeedPane(restoreFeed(feedPane)),
    close: () => applyFeedPane(closeFeed(feedPane)),
  };
}

export type FeedPaneControls = ReturnType<typeof useFeedPane>;
