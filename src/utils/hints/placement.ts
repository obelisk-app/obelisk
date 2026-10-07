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
