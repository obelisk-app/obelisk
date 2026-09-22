'use client';

/**
 * Pages the next batch when the reader gets near the bottom.
 *
 * `FeedList` has always had one of these inline, but surfaces that render
 * something other than a list of note cards — the media grid, for one — went
 * through a different path and simply stopped at the first page. Extracted
 * so any feed surface can page without re-implementing the observer (and
 * without re-deriving the prefetch margin, which is the part that decides
 * whether paging feels instant or looks like a stall).
 */

import { useEffect, useRef } from 'react';

/**
 * Start fetching this far before the sentinel is visible. Waiting for it to
 * actually enter the viewport means the reader watches a spinner they could
 * have skipped.
 */
export const PREFETCH_MARGIN = '600px';

export default function InfiniteSentinel({
  onReach,
  disabled = false,
}: {
  onReach: () => void;
  /** Exhausted, or a page already in flight. */
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onReachRef = useRef(onReach);
  onReachRef.current = onReach;

  useEffect(() => {
    const node = ref.current;
    if (!node || disabled || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onReachRef.current();
    }, { rootMargin: PREFETCH_MARGIN });
    observer.observe(node);
    return () => observer.disconnect();
  }, [disabled]);

  return <div ref={ref} aria-hidden="true" data-testid="infinite-sentinel" />;
}
