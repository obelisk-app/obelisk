'use client';

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDismiss } from '@/hooks/useDismiss';

export interface OverlayProps {
  onClose: () => void;
  /** Clicking the backdrop (not the panel) closes. Default true. */
  closeOnBackdrop?: boolean;
  /** Escape closes. Default true. */
  closeOnEscape?: boolean;
  /** Classes of the full-screen backdrop element. */
  backdropClassName: string;
  /**
   * Render into `document.body`. Needed when an ancestor establishes a
   * containing block (`.note-card` sets `contain: layout paint`), which
   * would otherwise lay a `fixed` panel out against the card and clip it.
   * The mobile sheets must not portal: their CSS is scoped to
   * `.obelisk-mobile`, which the body is outside of.
   */
  portal: boolean;
  testId?: string;
  children: ReactNode;
}

/**
 * The scaffolding under every modal and sheet: a backdrop that closes on
 * click, Escape wiring, and an optional portal. The panel itself (centered
 * card, bottom sheet) is the caller's; this only owns dismissal.
 */
export default function Overlay({
  onClose,
  closeOnBackdrop = true,
  closeOnEscape = true,
  backdropClassName,
  portal,
  testId,
  children,
}: OverlayProps) {
  // Escape only: the outside press is the backdrop's own click below.
  useDismiss({ onDismiss: onClose, enabled: closeOnEscape, outside: 'none' });
  // The panel stops propagation (see Modal), so a click inside it neither
  // closes the overlay nor reaches the React parent that opened it.
  const node = (
    <div className={backdropClassName} onClick={closeOnBackdrop ? onClose : undefined} data-testid={testId}>
      {children}
    </div>
  );
  if (!portal || typeof document === 'undefined') return node;
  return createPortal(node, document.body);
}
