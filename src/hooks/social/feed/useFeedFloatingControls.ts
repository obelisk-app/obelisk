import type { RefObject } from 'react';
import { scrollBehavior } from '@/utils/layout/scroll-behavior';

/**
 * The floating controls' one action with more than one step: back to the
 * newest note merges the live-tail buffer first, then scrolls the feed to
 * the top, so the pill's count and the reader arrive at the same place.
 */
export function useFeedFloatingControls({
  scrollRef,
  onShowPending,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  onShowPending: () => void;
}) {
  return {
    backToTop: () => {
      onShowPending();
      scrollRef.current?.scrollTo({ top: 0, behavior: scrollBehavior() });
    },
  };
}
