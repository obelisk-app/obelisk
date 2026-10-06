'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * Whether the inline compose row is still on screen inside the feed scroller.
 *
 * The inline compose row scrolls away within a screen or two, and with it
 * the only way to post. A floating button takes over from there rather
 * than making people scroll back up.
 *
 * `myPubkey` and `composer` re-attach the observer whenever the row is
 * re-mounted: sign-in, or the composer opening in place of the button.
 */
export function useComposeRowVisible(
  rowRef: RefObject<HTMLDivElement | null>,
  scrollRef: RefObject<HTMLDivElement | null>,
  myPubkey: string | null | undefined,
  composer: unknown,
): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const node = rowRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { root: scrollRef.current, threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rowRef, scrollRef, myPubkey, composer]);

  return visible;
}
