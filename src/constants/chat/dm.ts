/**
 * Chat: dm. Values the code in `services/chat/dm/opt-in.ts`,
 * `utils/chat/dm/pending.ts` reads, kept here so every reader imports the one
 * copy.
 */

export const DM_OPT_IN_STORAGE_KEY = 'obelisk:preferences';

export const DM_OPT_IN_PREFERENCE_KEY = 'directMessagesEnabled';

/** Most files a DM may hold pending at once. */
export const MAX_PENDING = 4;
