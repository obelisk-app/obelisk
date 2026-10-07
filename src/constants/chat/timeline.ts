/**
 * Chat: timeline. Values the code in
 * `utils/chat/timeline/channel-scroll-position.ts`,
 * `services/chat/timeline/message-flash.ts` reads, kept here so every reader
 * imports the one copy.
 */

export const CHANNEL_SCROLL_NEAR_BOTTOM_PX = 120;

/** How long the ring stays on a message the navigator jumped to. */
export const FLASH_MS = 1800;

/** Closer than this to the bottom counts as "at the latest message". */
export const NEAR_BOTTOM_PX = 80;
