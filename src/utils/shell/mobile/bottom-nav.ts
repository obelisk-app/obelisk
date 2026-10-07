import type { SurfaceId } from '@/utils/hints/registry';
import type { NavState, ScreenName } from './url-state';
import { NAV_ORDER, resolveParent } from './swipe-nav';

/**
 * Which hint each bottom-nav tab introduces.
 *
 * The tab is the only control that exists before you have been to the
 * screen, so it is where the dot goes: the app says "there is something
 * over there" before it explains what.
 */
export const NAV_HINT_ANCHOR: Partial<Record<ScreenName, string>> = {
  feed: 'nav-feed',
  'dms-list': 'dm-list',
  inbox: 'inbox-tabs',
  'settings-profile': 'profile-button',
};

export const NAV_HINT_ID: Partial<Record<ScreenName, string>> = {
  feed: 'feed-source',
  'dms-list': 'dms',
  inbox: 'inbox',
  'settings-profile': 'identity',
};

/**
 * Screens that have something to explain. Anything else (a sheet, an
 * editor, a sub-screen) maps to nothing rather than borrowing its parent's
 * hint, which would point at a control the reader cannot see.
 */
const HINT_SURFACES = new Set<string>([
  'server', 'channel', 'feed', 'dms-list', 'inbox', 'settings-profile', 'voice-room',
]);

/** The screen id doubles as the hint surface; the voice room's is `voice`. */
export function hintSurfaceFor(screen: ScreenName): SurfaceId | null {
  if (!HINT_SURFACES.has(screen)) return null;
  return (screen === 'voice-room' ? 'voice' : screen) as SurfaceId;
}

/**
 * The tab to highlight: the screen itself when it is a tab, else the tab the
 * nav resolves to. For sub-screens with dynamic parents (profile-view from
 * inbox, member-list from channel, ...) this respects where the user came
 * from rather than the static map. See docs/mobile-navigation.md §3.
 */
export function activeTabFor(nav: NavState): ScreenName | null {
  return NAV_ORDER.includes(nav.screen) ? nav.screen : resolveParent(nav);
}

/** A badge count as shown: nothing for none, `99+` past 99. */
export function badgeLabel(count: number | undefined): string | null {
  if (count === undefined || count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

/**
 * Hide the bottom nav on screens that own the full viewport (profile-view,
 * search, compose-dm, profile-edit) and while the on-screen keyboard is
 * open, so it doesn't wedge between the composer and the keyboard. Sheets
 * float over the previous screen, so the nav under them stays.
 */
export function shouldHideMobileBottomNav(screen: ScreenName, kbInset: number): boolean {
  return (
    screen === 'profile-view' ||
    screen === 'search' ||
    screen === 'compose-dm' ||
    screen === 'profile-edit' ||
    kbInset > 0
  );
}
