'use client';

/**
 * A popup menu that escapes its card.
 *
 * Note cards carry `contain: layout paint style` and `overflow: hidden` so
 * one overflowing note can't force the whole feed column to re-measure on
 * every scroll tick. That containment is also why an absolutely-positioned
 * menu inside a card was being clipped by the card and painted *under* the
 * next one: `contain: paint` establishes a containing block and a stacking
 * context, so a `z-index` on the menu only ranks it within its own card, and
 * a later sibling card paints on top regardless.
 *
 * Raising the z-index cannot fix that, and dropping the containment would
 * bring back the scroll lag. So the menu renders in a portal on `document.body`
 * with fixed coordinates measured from its trigger, outside every card's
 * containment, ranked against the page.
 *
 * Because the coordinates are a snapshot, the menu closes on scroll and
 * resize rather than drifting away from the button it belongs to.
 *
 * It is `ui/PopoverPanel` with `follow="close"`, preferring the side above
 * the trigger (the action row sits at the bottom of a card, so below is
 * usually off-screen or over the next note). Kept under this name and API
 * for its importers.
 */

import type { ReactNode, RefObject } from 'react';
import { cn } from '@/utils/style/cn';
import PopoverPanel from '@/components/ui/PopoverPanel';

export default function AnchoredMenu({
  open,
  onClose,
  anchorRef,
  children,
  width = 240,
  testId,
  align = 'end',
  panelClassName,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  width?: number;
  testId?: string;
  /** Which edge of the trigger the panel lines up with. */
  align?: 'start' | 'end';
  /** Replaces the panel's default look (e.g. `MENU_PANEL_CLASS`). */
  panelClassName?: string;
}) {
  return (
    <PopoverPanel
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      follow="close"
      prefer="above"
      align={align}
      width={width}
      role="menu"
      testId={testId}
      surface={panelClassName === undefined ? 'popover' : 'none'}
      className={panelClassName === undefined ? undefined : cn('overflow-hidden', panelClassName)}
    >
      {children}
    </PopoverPanel>
  );
}
