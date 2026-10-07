/**
 * Shell: desktop. Values the code in `utils/shell/desktop/compose-dm.ts`,
 * `utils/shell/desktop/desktop-layout.ts`, `utils/shell/desktop/dm-list.ts`,
 * `utils/shell/desktop/feed-pane.ts` reads, kept here so every reader imports
 * the one copy.
 */

import type { DmListTab } from '@/utils/shell/desktop/dm-list';
import type { FeedPaneState } from '@/utils/shell/desktop/feed-pane';

/** How many people the desktop "New message" search lists. */
export const COMPOSE_DM_MAX_RESULTS = 8;

/** localStorage keys for the desktop shell's remembered layout. */
export const SIDEBAR_KEY = 'obelisk-dex/sidebar-width';

export const PROFILE_PANE_KEY = 'obelisk-dex/profile-pane-width';

export const THREAD_PANE_KEY = 'obelisk-dex/thread-pane-width';

export const FEED_PANE_KEY = 'obelisk-dex/feed-pane-width';

export const SHOW_MEMBERS_KEY = 'obelisk-dex/show-members';

export const DM_LIST_TABS: ReadonlyArray<DmListTab> = ['follows', 'others'];

export const INITIAL_FEED_PANE: FeedPaneState = { open: false, mode: 'split' };
