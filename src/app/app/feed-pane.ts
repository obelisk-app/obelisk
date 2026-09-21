/**
 * Where the feed sits relative to whatever else is on screen.
 *
 * This replaced a single rail button that cycled off → split → full → off.
 * That was three states behind one control with nothing on screen saying
 * which you were in or what the next press would do — you had to press it and
 * find out. The fix isn't a cleverer cycle, it's splitting the two questions
 * apart and giving each a visible control:
 *
 *   is the feed open?   → the rail button, a plain toggle
 *   how big is it?      → ⤢ / ⤡ in the feed pane's own header
 *
 * Kept as a pure module with its own tests because the previous version's
 * bug was in exactly this logic, inline in a 4000-line shell.
 */

export type FeedPaneMode = 'split' | 'full';

export type FeedHost =
  | { kind: 'group'; groupId: string }
  | { kind: 'dm'; peer: string | null }
  | { kind: 'feed' }
  | { kind: 'empty' };

/**
 * Splitting is only meaningful against a room. Beside a DM or an empty pane
 * a half-width feed is just a narrow feed, so those open full.
 */
export function canSplitAgainst(host: FeedHost): boolean {
  return host.kind === 'group';
}

/** The mode the feed should open in, given where the user already is. */
export function openModeFor(host: FeedHost): FeedPaneMode {
  return canSplitAgainst(host) ? 'split' : 'full';
}

/**
 * Whether the pane should offer "restore to split".
 *
 * Only when there's something to sit beside — offering it against an empty
 * pane would produce a half-width feed next to nothing, which is the state
 * the old cycle could strand you in.
 */
export function canRestore(host: FeedHost, mode: FeedPaneMode): boolean {
  return mode === 'full' && canSplitAgainst(host);
}

export type FeedPaneState = {
  open: boolean;
  mode: FeedPaneMode;
};

/** The rail button: open it, or put it away. Never a third thing. */
export function toggleFeed(state: FeedPaneState, host: FeedHost): FeedPaneState {
  if (state.open) return { ...state, open: false };
  return { open: true, mode: openModeFor(host) };
}

export function expandFeed(state: FeedPaneState): FeedPaneState {
  return { ...state, open: true, mode: 'full' };
}

export function restoreFeed(state: FeedPaneState): FeedPaneState {
  return { ...state, open: true, mode: 'split' };
}

export function closeFeed(state: FeedPaneState): FeedPaneState {
  return { ...state, open: false };
}

export const INITIAL_FEED_PANE: FeedPaneState = { open: false, mode: 'split' };
