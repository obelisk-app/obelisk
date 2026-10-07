import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDismiss } from '@/hooks/common/useDismiss';
import { placeHintCard, type HintPlacement } from '@/utils/hints/placement';

/**
 * The hint card's view model: its position next to `anchor`, measured
 * before paint and again on every scroll (capture phase, so a scrolling
 * container counts) and resize, and Escape to dismiss
 * (docs/conventions.md#component-files). `title` and `body` re-measure,
 * since they change the card's height.
 */
export function useHintCallout(anchor: HTMLElement, title: string, body: string, onDismiss: () => void) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<HintPlacement | null>(null);

  const place = useCallback(() => {
    const height = cardRef.current?.offsetHeight ?? 0;
    setPos(placeHintCard(anchor.getBoundingClientRect(), height, { width: window.innerWidth, height: window.innerHeight }));
  }, [anchor]);

  useLayoutEffect(() => {
    place();
  }, [place, title, body]);

  useEffect(() => {
    // `true` for the capture phase: the anchor may live inside a scroll
    // container whose scroll events never reach the window.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [place]);

  // Escape only: a press outside lands on the scrim, which has its own handler.
  useDismiss({ onDismiss, outside: 'none' });

  return { cardRef, pos, canPortal: typeof document !== 'undefined' };
}
