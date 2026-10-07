/**
 * Shell: mobile. Values the code in
 * `hooks/shell/mobile/rail/useMobileRelayTile.ts`,
 * `services/shell/mobile/message-actions.ts`,
 * `utils/shell/mobile/bottom-nav.ts`, `utils/shell/mobile/carousel-slots.ts`,
 * `utils/shell/mobile/category-options.ts`,
 * `utils/shell/mobile/channel-timeline.ts`, `utils/shell/mobile/swipe-nav.ts`,
 * `utils/shell/mobile/url-state.ts` reads, kept here so every reader imports
 * the one copy.
 */

import type { ScreenName, NavState } from '@/utils/shell/mobile/url-state';

/** How long a touch has to stay down to count as a long press. */
export const RELAY_TILE_LONG_PRESS_MS = 500;

export const REACT_EVENT = 'obelisk-mobile:react';

export const REPLY_EVENT = 'obelisk-mobile:reply';

/** The emoji row at the top of the sheet; `+` opens the full picker. */
export const QUICK_REACTIONS = ['👍', '❤️', '🚀', '🔥', '👀', '+'] as const;

export const MORE_REACTIONS = '+';

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

/** The carousel's slide: 180ms, eased out. */
export const CAROUSEL_TRANSITION = 'transform 180ms cubic-bezier(0.2, 0.85, 0.25, 1)';

/** The value the category picker uses for "no category". */
export const NO_CATEGORY = '__none__';

/** Stable empty list so a message without reactions keeps the same prop identity. */
export const EMPTY_REACTIONS: never[] = [];

// Top-level bottom-nav screens, left-to-right. Swipe-left advances; swipe-right
// retreats.
export const NAV_ORDER: ScreenName[] = ['server', 'feed', 'dms-list', 'inbox', 'settings-profile'];

// Sub-screens map back to the top-level tab they belong to. This lets us treat
// a horizontal swipe on a sub-screen as if the user were on its parent - both
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
  'msg-actions': 'server',
};

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
