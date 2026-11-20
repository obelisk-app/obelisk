/**
 * Chat: per-channel preferences. Values the channel prefs store
 * (`store/chat/channel-prefs.ts`) and the channel menu read.
 */

/** JSON has no Infinity; -1 means "until I turn it back on". */
export const MUTED_FOREVER = -1;

export const RECENT_CHANNEL_WINDOW_SECONDS = 72 * 60 * 60;
