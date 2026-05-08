export type ScreenName =
  | 'login'
  | 'profile-setup'
  | 'server'
  | 'channel'
  | 'voice-room'
  | 'dms-list'
  | 'dm-thread'
  | 'inbox'
  | 'profile-view'
  | 'member-list'
  | 'compose-dm'
  | 'search'
  | 'forum'
  | 'msg-actions'
  | 'zap-modal'
  | 'settings-profile'
  | 'settings-prefs';

export interface NavState {
  screen: ScreenName;
  groupId: string | null;
  dmPeer: string | null;
  profilePubkey: string | null;
  forumGroupId: string | null;
  baseScreen: ScreenName | null;
  msgContext: { id: string; pubkey: string; content: string } | null;
}

export const initialNav: NavState = {
  screen: 'server',
  groupId: null,
  dmPeer: null,
  profilePubkey: null,
  forumGroupId: null,
  baseScreen: null,
  msgContext: null,
};

const KNOWN_SCREENS: ReadonlySet<ScreenName> = new Set<ScreenName>([
  'server',
  'channel',
  'voice-room',
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
]);

function shortHost(url: string): string {
  try { return new URL(url).host; } catch { return url.replace(/^wss?:\/\//, '').replace(/\/+$/, ''); }
}

export function urlFor(nav: NavState, relay: string | null, pathname = '/app'): string {
  const params = new URLSearchParams();
  if (nav.groupId) params.set('c', nav.groupId);
  if (nav.forumGroupId && nav.forumGroupId !== nav.groupId) params.set('f', nav.forumGroupId);
  if (nav.dmPeer) params.set('p', nav.dmPeer);
  if (nav.profilePubkey) params.set('u', nav.profilePubkey);
  if (relay) params.set('relay', shortHost(relay));
  if (nav.screen !== 'server' && nav.screen !== 'msg-actions' && nav.screen !== 'zap-modal') {
    params.set('s', nav.screen);
  }
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
  return {
    nav: {
      ...initialNav,
      screen,
      groupId: c,
      dmPeer: p,
      profilePubkey: u,
      forumGroupId: params.get('f'),
    },
    relay: relay ? (/^wss?:\/\//.test(relay) ? relay : `wss://${relay}`) : null,
  };
}
