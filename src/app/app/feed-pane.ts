/**
 * What the rail's Feed button does, depending on where you already are.
 *
 * Extracted from `DesktopShell` because it is a small state machine with
 * three inputs and four outcomes, and getting it wrong is the difference
 * between "one button covers peek / focus / dismiss" and "the button
 * sometimes does nothing".
 *
 * The shape it replaces: Chat and Feed were tabs inside the group view, which
 * made them mutually exclusive — you lost sight of a live room to glance at
 * the feed. Splitting first means the conversation stays on screen.
 */

export type FeedView =
  | { kind: 'group'; groupId: string }
  | { kind: 'dm'; peer: string | null }
  | { kind: 'feed' }
  | { kind: 'empty' };

export type FeedAction =
  /** Show the feed beside the group you're in. */
  | { kind: 'split' }
  /** Take the whole surface. */
  | { kind: 'full' }
  /** Put it away and go back to `view`. */
  | { kind: 'close'; view: FeedView };

export function nextFeedAction(
  view: FeedView,
  splitFeed: boolean,
  lastGroupId: string | null,
): FeedAction {
  // Already full screen: the next press puts it away. Returning to the room
  // we came from beats dropping the user on an empty pane.
  if (view.kind === 'feed') {
    return {
      kind: 'close',
      view: lastGroupId ? { kind: 'group', groupId: lastGroupId } : { kind: 'empty' },
    };
  }

  if (view.kind === 'group') {
    // First press splits so the room stays visible; second press commits to
    // the feed.
    return splitFeed ? { kind: 'full' } : { kind: 'split' };
  }

  // DMs or an empty pane: there is nothing worth splitting against, so skip
  // straight to full rather than showing a half-width feed beside nothing.
  return { kind: 'full' };
}
