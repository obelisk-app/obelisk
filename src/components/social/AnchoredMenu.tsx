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
 * with fixed coordinates measured from its trigger — outside every card's
 * containment, ranked against the page.
 *
 * Because the coordinates are a snapshot, the menu closes on scroll and
 * resize rather than drifting away from the button it belongs to.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Keeps the panel off the viewport edges. */
const MARGIN = 8;

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
  anchorRef: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
  width?: number;
  testId?: string;
  /** Which edge of the trigger the panel lines up with. */
  align?: 'start' | 'end';
  /** Replaces the panel's default look (e.g. `MENU_PANEL_CLASS`). */
  panelClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? 0;

    // Prefer above the trigger — the action row sits at the bottom of a card,
    // so below is usually off-screen or over the next note.
    const fitsAbove = rect.top - panelHeight - MARGIN > 0;
    const top = fitsAbove
      ? rect.top - panelHeight - 4
      : Math.min(rect.bottom + 4, window.innerHeight - panelHeight - MARGIN);

    const rawLeft = align === 'end' ? rect.right - width : rect.left;
    const left = Math.max(MARGIN, Math.min(rawLeft, window.innerWidth - width - MARGIN));

    setPos({ top: Math.max(MARGIN, top), left });
  }, [open, anchorRef, width, align, children]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    // Fixed coordinates are a snapshot: close rather than let the panel
    // drift away from the button it belongs to.
    const onReflow = () => onClose();

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, onClose, anchorRef]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      data-testid={testId}
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width,
        // Hidden until measured, so it never flashes at the wrong place.
        visibility: pos ? 'visible' : 'hidden',
      }}
      className={`z-[200] overflow-hidden ${panelClassName ?? 'rounded-xl border border-lc-border bg-lc-dark py-1 shadow-2xl'}`}
    >
      {children}
    </div>,
    document.body,
  );
}
