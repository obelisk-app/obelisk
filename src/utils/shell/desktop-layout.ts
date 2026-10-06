import type { FeedHost, FeedPaneState } from './feed-pane';
import type { View } from './view';

/** localStorage keys for the desktop shell's remembered layout. */
export const SIDEBAR_KEY = 'obelisk-dex/sidebar-width';
export const PROFILE_PANE_KEY = 'obelisk-dex/profile-pane-width';
export const THREAD_PANE_KEY = 'obelisk-dex/thread-pane-width';
export const FEED_PANE_KEY = 'obelisk-dex/feed-pane-width';
export const SHOW_MEMBERS_KEY = 'obelisk-dex/show-members';

export type RailMode = { kind: 'dm' } | { kind: 'feed' } | { kind: 'relay'; url: string };

/** Which rail entry is lit: DMs, the feed (full or split), or the relay. */
export function railModeFor(view: View, splitFeed: boolean, relay: string): RailMode {
  return view.kind === 'dm'
    ? { kind: 'dm' }
    : view.kind === 'feed' || splitFeed
      ? { kind: 'feed' }
      : { kind: 'relay', url: relay };
}

/**
 * What the feed is sitting beside. While the feed is full-screen the host
 * is the room we came from, so collapsing returns there rather than to an
 * empty pane.
 */
export function feedHostFor(view: View, lastGroupId: string | null): FeedHost {
  return view.kind === 'feed'
    ? (lastGroupId ? { kind: 'group', groupId: lastGroupId } : { kind: 'empty' })
    : view;
}

/**
 * The view to show after the feed pane changes, or `null` to leave it.
 * Pane state is the source of truth; `view` is synced from it.
 */
export function viewForFeedPane(next: FeedPaneState, view: View, host: FeedHost): View | null {
  if (next.open && next.mode === 'full') return { kind: 'feed' };
  // Split or closed: the feed must not be the main view any more.
  if (view.kind === 'feed') {
    return host.kind === 'group' ? { kind: 'group', groupId: host.groupId } : { kind: 'empty' };
  }
  return null;
}

/** Stored sidebar width, clamped to the draggable range. */
export function readSidebarWidth(stored: string | null): number {
  const n = stored ? parseInt(stored, 10) : 264;
  return Number.isFinite(n) ? Math.max(200, Math.min(500, n)) : 264;
}
