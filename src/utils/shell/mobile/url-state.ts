import { shortHost } from '@/utils/relay-url/url-host';

export type ScreenName =
  | 'login'
  | 'profile-setup'
  | 'server'
  | 'channel'
  | 'voice-room'
  | 'feed'
  | 'dms-list'
  | 'dm-thread'
  | 'inbox'
  | 'profile-view'
  | 'member-list'
  | 'compose-dm'
  | 'search'
  | 'forum'
  | 'msg-actions'
  | 'settings-profile'
  | 'settings-prefs'
  | 'profile-edit';

export interface NavState {
  screen: ScreenName;
  groupId: string | null;
  dmPeer: string | null;
  profilePubkey: string | null;
  forumGroupId: string | null;
  baseScreen: ScreenName | null;
  msgContext: {
    id: string;
    pubkey: string;
    content: string;
    groupId?: string;
    canModerate?: boolean;
    canDeleteOwn?: boolean;
  } | null;
  // The top-level tab (or sub-screen) the user came from when this screen
  // was opened. Drives the bottom-nav active highlight and swipe-back target
  // for screens reachable from multiple contexts (profile-view, member-list,
  // search, msg-actions). See docs/mobile-navigation.md §3.
  parentScreen: ScreenName | null;
}

export const initialNav: NavState = {
  screen: 'server',
  groupId: null,
  dmPeer: null,
  profilePubkey: null,
  forumGroupId: null,
  baseScreen: null,
  msgContext: null,
  parentScreen: null,
};

const KNOWN_SCREENS: ReadonlySet<ScreenName> = new Set<ScreenName>([
  'server',
  'channel',
  'voice-room',
  'feed',
  'dms-list',
  'dm-thread',
  'inbox',
  'profile-view',
  'member-list',
  'compose-dm',
  'search',
  'forum',
  'settings-profile',
  'settings-prefs',
  'profile-edit',
]);

/**
 * The chat shell's path in the current language: `/app`, `/es/app` or
 * `/pt/app`. Every history write in the phone shell rebuilds the URL from
 * this, so a Spanish reader on `/es/app` stays on it instead of being
 * rewritten to the English `/app` on the first navigation.
 */
export function appShellPath(locationPathname?: string): string {
  const match = locationPathname?.match(/^\/(es|pt)\/app(?:\/|$)/);
  return match ? `/${match[1]}/app` : '/app';
}

function currentAppShellPath(): string {
  return appShellPath(typeof window === 'undefined' ? undefined : window.location.pathname);
}

export function urlFor(nav: NavState, relay: string | null, pathname = currentAppShellPath()): string {
  const params = new URLSearchParams();
  if (nav.groupId) params.set('c', nav.groupId);
  if (nav.forumGroupId && nav.forumGroupId !== nav.groupId) params.set('f', nav.forumGroupId);
  if (nav.dmPeer) params.set('p', nav.dmPeer);
  if (nav.profilePubkey) params.set('u', nav.profilePubkey);
  if (relay) params.set('relay', shortHost(relay));
  if (nav.screen !== 'server' && nav.screen !== 'msg-actions') {
    params.set('s', nav.screen);
  }
  if (nav.parentScreen) params.set('pr', nav.parentScreen);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function parseUrl(search: string): { nav: NavState; relay: string | null } {
  const params = new URLSearchParams(search.replace(/^\?/, '').replace(/;/g, '&'));
  const sParam = params.get('s');
  const c = params.get('c');
  const p = params.get('p');
  const u = params.get('u');
  let screen: ScreenName = 'server';
  if (sParam && KNOWN_SCREENS.has(sParam as ScreenName)) screen = sParam as ScreenName;
  else if (c) screen = 'channel';
  else if (p) screen = 'dm-thread';
  else if (u) screen = 'profile-view';
  const relay = params.get('relay');
  const prParam = params.get('pr');
  const parentScreen: ScreenName | null =
    prParam && KNOWN_SCREENS.has(prParam as ScreenName) ? (prParam as ScreenName) : null;
  return {
    nav: {
      ...initialNav,
      screen,
      groupId: c,
      dmPeer: p,
      profilePubkey: u,
      forumGroupId: params.get('f'),
      parentScreen,
    },
    relay: relay ? (/^wss?:\/\//.test(relay) ? relay : `wss://${relay}`) : null,
  };
}

/**
 * A nav read back from `history.state` on back or forward. Builds before
 * round 23 had a `zap-modal` sheet screen (a mock that could not pay); the
 * zap button now opens the real zap modal without a history entry, so no
 * screen of that name exists. A saved entry that still names it restores
 * the screen the sheet floated over.
 */
export function restoredNav(saved: NavState): NavState {
  if ((saved.screen as string) !== 'zap-modal') return saved;
  return {
    ...saved,
    screen: saved.baseScreen ?? (saved.groupId ? 'channel' : 'server'),
    baseScreen: null,
    msgContext: null,
  };
}
