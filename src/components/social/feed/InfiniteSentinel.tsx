'use client';

/**
 * Pages the next batch when the reader gets near the bottom.
 *
 * `FeedList` has always had one of these inline, but surfaces that render
 * something other than a list of note cards (the media grid, for one) went
 * through a different path and simply stopped at the first page. Extracted
 * so any feed surface can page without re-implementing the observer (and
 * without re-deriving the prefetch margin, which is the part that decides
 * whether paging feels instant or looks like a stall). Both now share
 * `watchSentinel` in `src/services/social/feed-scroll.ts`.
 */

import { useInfiniteSentinel } from '@/hooks/social/feed/useInfiniteSentinel';

export default function InfiniteSentinel({
  onReach,
  disabled = false,
}: {
  onReach: () => void;
  /** Exhausted, or a page already in flight. */
  disabled?: boolean;
}) {
  const ref = useInfiniteSentinel(onReach, disabled);
  return <div ref={ref} aria-hidden="true" data-testid="infinite-sentinel" />;
}
