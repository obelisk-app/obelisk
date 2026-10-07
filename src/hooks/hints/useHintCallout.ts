import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDismiss } from '@/hooks/common/useDismiss';

/** Keeps the card off the viewport edges. */
const MARGIN = 8;
/** The card's width, in pixels. */
export const HINT_CARD_WIDTH = 264;
/** Breathing room between the card and the control it points at. */
const GAP = 10;

export interface HintPlacement { top: number; left: number; below: boolean }

/**
 * Where the card goes for an anchor's rect: below it when it fits, else
 * above; centred on it, clamped to the viewport.
 */
export function placeHintCard(
  rect: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'width'>,
  cardHeight: number,
  viewport: { width: number; height: number },
): HintPlacement {
  const fitsBelow = rect.bottom + GAP + cardHeight < viewport.height - MARGIN;
  const top = fitsBelow ? rect.bottom + GAP : Math.max(MARGIN, rect.top - cardHeight - GAP);
  const centred = rect.left + rect.width / 2 - HINT_CARD_WIDTH / 2;
  const left = Math.max(MARGIN, Math.min(centred, viewport.width - HINT_CARD_WIDTH - MARGIN));
  return { top: Math.max(MARGIN, top), left, below: fitsBelow };
}

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
