/**
 * Chat: members. Values the code in `hooks/chat/members/useNostrPresence.ts`
 * reads, kept here so every reader imports the one copy.
 */

/** A user counts as recently active if they published on this group relay in this window. */
export const PRESENCE_WINDOW_MS = 15 * 60 * 1000;
