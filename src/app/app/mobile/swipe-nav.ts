import { initialNav, urlFor, type NavState, type ScreenName } from './url-state';

// Top-level bottom-nav screens, left-to-right. Swipe-left advances; swipe-right
// retreats.
export const NAV_ORDER: ScreenName[] = ['server', 'dms-list', 'inbox', 'settings-profile'];

// Sub-screens map back to the top-level tab they belong to. This lets us treat
// a horizontal swipe on a sub-screen as if the user were on its parent — both
// directions skip the parent and switch tabs (swipe-left → next top-level,
// swipe-right → previous top-level), so a horizontal gesture is always a tab
// switch and never a within-tab pop. To go back inside a tab the user uses the
// header back-button or re-taps the active bottom-nav item.
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
  'profile-edit': 'settings-profile',
};

export type SwipeNavAction =
  | { kind: 'top-level'; target: ScreenName; dir: 'forward' | 'back' }
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
// On a sub-screen the parent tab is treated as the screen's anchor in
// NAV_ORDER, so the neighbors are the tabs immediately before and after the
// parent — matching the swipe behavior, which skips the parent in both
// directions. The parent itself sits at the active position behind the
// sub-screen overlay; the renderer in PhoneShell handles that placement
// directly rather than going through this function.
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
    left: parentIdx > 0 ? NAV_ORDER[parentIdx - 1] : null,
    right: parentIdx < NAV_ORDER.length - 1 ? NAV_ORDER[parentIdx + 1] : null,
  };
}

// Decide what a horizontal swipe means for the current screen.
//
// On a top-level tab (server / dms-list / inbox / settings-profile) swipe
// cycles through NAV_ORDER. On a sub-screen we anchor at the parent's index
// in NAV_ORDER and step past it: swipe-left → parentIdx + 1, swipe-right →
// parentIdx - 1, no-op at the ends. So a horizontal gesture is always a
// tab switch — popping back inside a tab (channel → channels list, prefs →
// you) goes through the header back-button, not a swipe.
// Initial history seed entries: the first one is replaced over the current
// browser entry, the rest are pushed in order. The guard sentinel sits behind
// everything so that a back-press past the user's screen stack arms the
// "press again to exit" toast. When a deep link drops the user straight onto
// a sub-screen (e.g. /app?c=…) we also seed the parent tab between the guard
// and the sub-screen — otherwise the very first back-press would land on the
// guard and show the exit toast, which reads as broken.
export interface SeedHistoryEntry {
  state: { nav?: NavState; guard?: boolean };
  url: string;
}

export function buildSeedHistory(parsed: NavState, relay: string | null): SeedHistoryEntry[] {
  const seedUrl = urlFor(parsed, relay);
  const parentScreen = SUB_TO_NAV[parsed.screen] ?? null;
  const parentNav: NavState | null = parentScreen
    ? { ...initialNav, screen: parentScreen }
    : null;
  const parentUrl = parentNav ? urlFor(parentNav, relay) : null;

  const entries: SeedHistoryEntry[] = [];
  // Guard URL matches the parent (or the parsed screen if no parent) so the
  // address bar doesn't flicker when the popstate handler re-pushes after
  // arming the toast.
  entries.push({ state: { guard: true }, url: parentUrl ?? seedUrl });
  if (parentNav && parentUrl) {
    entries.push({ state: { nav: parentNav }, url: parentUrl });
  }
  entries.push({ state: { nav: parsed }, url: seedUrl });
  return entries;
}

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
  const parentIdx = NAV_ORDER.indexOf(parent);
  const nextIdx = goingRight ? parentIdx - 1 : parentIdx + 1;
  if (nextIdx < 0 || nextIdx >= NAV_ORDER.length) return { kind: 'noop' };
  return {
    kind: 'top-level',
    target: NAV_ORDER[nextIdx],
    dir: goingRight ? 'back' : 'forward',
  };
}
