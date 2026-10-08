/**
 * Chat: forum. Values the code in `services/chat/forum/new-thread-form.ts`,
 * `services/chat/forum/forum-prefs.ts`, `utils/chat/forum/forum-tags.ts`
 * reads, kept here so every reader imports the one copy.
 */

import type { ForumPrefs } from '@/services/chat/forum/forum-prefs';

export const MAX_THREAD_TAGS = 5;

/** Most tags one publications channel may curate. */
export const MAX_FORUM_TAGS = 20;

export const DEFAULT_FORUM_PREFS: ForumPrefs = { sortBy: 'recent', viewMode: 'list', tagMatch: 'any' };
