/**
 * Read state: mention seen. Values the code in
 * `hooks/read-state/useMentionSeen.ts` reads, kept here so every reader
 * imports the one copy.
 */

export const MENTION_SEEN_THRESHOLD = 0.6;

/** A row taller than the viewport counts once it covers this share of it. */
export const MENTION_SEEN_VIEWPORT_SHARE = 0.4;

export const MENTION_SEEN_DWELL_MS = 1000;

export const MENTION_MISSING_DWELL_MS = 2000;
