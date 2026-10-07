/**
 * Social: feed scroll. Values the code in `services/social/feed-scroll.ts`
 * reads, kept here so every reader imports the one copy.
 */

/**
 * Start fetching this far before the sentinel is visible. Waiting for it to
 * actually enter the viewport means the reader watches a spinner they could
 * have skipped.
 */
export const PREFETCH_MARGIN = '600px';

/** How close to the top counts as "still at the top". */
export const AT_TOP_PX = 120;

/**
 * Pulling up when already at the top is the gesture people use to refresh,
 * so honour it instead of making them find a button. Throttled, because the
 * gesture fires continuously and each refresh is a relay round trip.
 */
export const PULL_REFRESH_COOLDOWN_MS = 4000;

/** Enough pull to be deliberate rather than the tail of a scroll. */
export const PULL_THRESHOLD_PX = 60;
