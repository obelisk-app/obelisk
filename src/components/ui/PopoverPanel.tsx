'use client';

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPosition, type PopoverFollow } from '@/hooks/useAnchoredPosition';
import { useDismiss } from '@/hooks/useDismiss';
import { cn } from '@/utils/style/cn';
import { MENU_PANEL_CLASS } from './menu';
import type { PopoverAlign, PopoverSide } from '@/utils/layout/popover-position';

export type { PopoverFollow } from '@/hooks/useAnchoredPosition';
export type { PopoverAlign, PopoverSide } from '@/utils/layout/popover-position';

/**
 * The panel's look.
 * - `popover`: `rounded-xl ... py-1 shadow-2xl`, the dropdown surface (AnchoredMenu's default).
 * - `menu`: `MENU_PANEL_CLASS`, for rows built from `menu.tsx`.
 * - `none`: no surface; the children paint it (FloatingPanel's contract).
 */
export type PopoverSurface = 'popover' | 'menu' | 'none';
/**
 * - `outside-and-escape`: a press outside the panel and its anchor, or Escape, closes it.
 * - `host`: the host already handles dismissal (FloatingPanel's contract).
 */
export type PopoverDismiss = 'outside-and-escape' | 'host';
export type PopoverRole = 'menu' | 'dialog' | 'listbox';

export const POPOVER_SURFACE_CLASS: Record<PopoverSurface, string> = {
  popover: 'rounded-xl border border-lc-border bg-lc-dark py-1 shadow-2xl',
  menu: MENU_PANEL_CLASS,
  none: '',
};

export interface PopoverPanelProps {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  /** Default true: hosts that mount the panel only while open can leave it out. */
  open?: boolean;
  follow?: PopoverFollow;
  prefer?: PopoverSide;
  align?: PopoverAlign;
  /** Fixed width in px; unset sizes the panel to its content. */
  width?: number;
  surface?: PopoverSurface;
  dismiss?: PopoverDismiss;
  role?: PopoverRole;
  /** Extra classes; with `surface="none"` this is the whole look. */
  className?: string;
  testId?: string;
  /** Lets the host treat clicks inside the panel as "inside". */
  panelRef?: RefObject<HTMLDivElement | null>;
  /** `data-*` markers other code looks for on the panel (e.g. `data-no-msg-menu`). */
  dataAttributes?: Readonly<Record<`data-${string}`, string>>;
}

/**
 * One anchored popover for the two that existed: `ui/FloatingPanel`
 * (follows its anchor through a scrolling list) and `social/AnchoredMenu`
 * (snapshot, closes on scroll). Both escape containment by rendering in a
 * portal on `document.body` with fixed coordinates, are clamped to the
 * viewport, and stay hidden until measured.
 */
export default function PopoverPanel({
  anchorRef,
  onClose,
  children,
  open = true,
  follow = 'track',
  prefer = 'below',
  align = 'end',
  width,
  surface = 'popover',
  dismiss = 'outside-and-escape',
  role,
  className,
  testId,
  panelRef: externalRef,
  dataAttributes,
}: PopoverPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pos = useAnchoredPosition({ anchorRef, panelRef, open, onClose, prefer, align, follow });
  useDismiss({
    refs: [panelRef, anchorRef],
    onDismiss: onClose,
    enabled: open && dismiss === 'outside-and-escape',
  });

  useLayoutEffect(() => {
    if (!externalRef) return;
    externalRef.current = open ? panelRef.current : null;
    return () => { externalRef.current = null; };
  }, [externalRef, open]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={panelRef}
      role={role}
      data-testid={testId}
      data-side={pos?.side}
      {...dataAttributes}
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width,
        zIndex: 200,
        // Hidden until measured, so it never flashes at the wrong place.
        visibility: pos ? 'visible' : 'hidden',
      }}
      className={cn(surface !== 'none' && 'overflow-hidden', POPOVER_SURFACE_CLASS[surface], className) || undefined}
    >
      {children}
    </div>,
    document.body,
  );
}
