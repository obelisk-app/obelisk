import type { ScreenName } from './url-state';

// Top-level bottom-nav screens, left-to-right. Swipe-left advances; swipe-right
// retreats.
export const NAV_ORDER: ScreenName[] = ['server', 'dms-list', 'inbox', 'settings-profile'];

// Sub-screens map back to the top-level tab they belong to. This lets us treat
// a horizontal swipe on a sub-screen as if the user were on its parent — so
// swipe-left from a channel jumps to DMs (the tab past Servers), instead of
// being a no-op the way it used to be.
export const SUB_TO_NAV: Partial<Record<ScreenName, ScreenName>> = {
  channel: 'server',
  'voice-room': 'server',
  forum: 'server',
  'member-list': 'server',
  search: 'server',
  'dm-thread': 'dms-list',
  'compose-dm': 'dms-list',
  'profile-view': 'server',
  'settings-prefs': 'settings-profile',
};

export type SwipeNavAction =
  | { kind: 'top-level'; target: ScreenName; dir: 'forward' | 'back' }
  | { kind: 'history-back' }
  | { kind: 'noop' };

// Snap decision after a drag ends. Either commit (slide to the neighbor we
// were partway towards) or revert (snap back to the current screen). Distance
// threshold = 1/3 of viewport width — close to the iOS standard. The velocity
// fallback lets fast flicks commit even if they didn't pass the distance bar,
// as long as the flick direction agrees with the displacement (otherwise a
// flick reversing direction would weirdly commit).
export function decideSnap(
  dx: number,
  velocityPxPerMs: number,
  width: number,
): 'commit' | 'revert' {
  if (dx === 0 || width <= 0) return 'revert';
  if (Math.abs(dx) > width / 3) return 'commit';
  if (Math.abs(velocityPxPerMs) > 0.4 && Math.sign(velocityPxPerMs) === Math.sign(dx)) {
    return 'commit';
  }
  return 'revert';
}

// Visual neighbors for the drag-tracking carousel: which screen, if any, sits
// to the left/right of the current screen and should be rendered partially
// behind the active one while the user pans.
//
// On a top-level tab, neighbors are the previous/next entries in NAV_ORDER.
// On a sub-screen the left neighbor is the SUB_TO_NAV parent (matches the
// history-back gesture in the common case) and the right neighbor is the
// top-level tab past the parent (matches the swipe-left jump).
export function neighborsFor(screen: ScreenName): { left: ScreenName | null; right: ScreenName | null } {
  const navIndex = NAV_ORDER.indexOf(screen);
  if (navIndex >= 0) {
    return {
      left: navIndex > 0 ? NAV_ORDER[navIndex - 1] : null,
      right: navIndex < NAV_ORDER.length - 1 ? NAV_ORDER[navIndex + 1] : null,
    };
  }
  const parent = SUB_TO_NAV[screen];
  if (!parent) return { left: null, right: null };
  const parentIdx = NAV_ORDER.indexOf(parent);
  return {
    left: parent,
    right: parentIdx < NAV_ORDER.length - 1 ? NAV_ORDER[parentIdx + 1] : null,
  };
}

// Decide what a horizontal swipe means for the current screen.
//
// On a top-level tab (server / dms-list / inbox / settings-profile) swipe
// cycles through NAV_ORDER. On a sub-screen, swipe-right pops back to the
// parent (via window.history.back so push-state stays consistent), and
// swipe-left jumps to the top-level tab immediately after the parent so the
// user can switch tabs without tapping the bottom nav.
export function decideSwipeNav(screen: ScreenName, goingRight: boolean): SwipeNavAction {
  const navIndex = NAV_ORDER.indexOf(screen);
  if (navIndex >= 0) {
    const nextIdx = goingRight ? navIndex - 1 : navIndex + 1;
    if (nextIdx < 0 || nextIdx >= NAV_ORDER.length) return { kind: 'noop' };
    return {
      kind: 'top-level',
      target: NAV_ORDER[nextIdx],
      dir: goingRight ? 'back' : 'forward',
    };
  }
  const parent = SUB_TO_NAV[screen];
  if (!parent) return { kind: 'noop' };
  if (goingRight) return { kind: 'history-back' };
  const parentIdx = NAV_ORDER.indexOf(parent);
  const nextIdx = parentIdx + 1;
  if (nextIdx >= NAV_ORDER.length) return { kind: 'noop' };
  return { kind: 'top-level', target: NAV_ORDER[nextIdx], dir: 'forward' };
}
