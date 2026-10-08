'use client';

import type { ReactNode } from 'react';
import Overlay from './Overlay';
import Card from '../layout/Card';

export interface ModalProps {
  onClose: () => void;
  /**
   * If false, clicking the dark backdrop does nothing. Default true matches
   * the dominant UX: most modals in the app dismiss on outside click.
   */
  closeOnBackdrop?: boolean;
  /** If false, Escape does nothing. Default true. */
  closeOnEscape?: boolean;
  /** Extra classes on the inner panel (sizing, radius, etc.). */
  panelClassName?: string;
  /** The shared themed card surface, with panelClassName reserved for layout. */
  surface?: 'custom' | 'card';
  /** Identifies the backdrop in tests; individual modals add their own ids. */
  testId?: string;
  /**
   * Stacking class of the backdrop. `z-50` sits under the fullscreen
   * settings modal (`z-[100]`); a dialog opened from inside it needs more.
   */
  layerClassName?: string;
  /** `alertdialog` for a confirmation that interrupts; `dialog` otherwise. */
  role?: 'dialog' | 'alertdialog';
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  children: ReactNode;
}

/**
 * The centered desktop modal: dimmed backdrop + centered panel + click-outside
 * and Escape wiring (from Overlay). Chrome like headings and footers is the
 * caller's, or ModalHeader's.
 *
 * Portalled, because `fixed` is only viewport-relative while no ancestor
 * establishes a containing block, and feed notes do: `.note-card` sets
 * `contain: layout paint`. A modal opened from inside a card was laid out
 * against the card and clipped by it, which looked like the click doing
 * nothing. Events still reach React parents through the portal, so the
 * panel stops propagation: a click inside it must not reach the card.
 */
export default function Modal({
  onClose,
  closeOnBackdrop = true,
  closeOnEscape = true,
  panelClassName = 'w-full max-w-lg mx-4 rounded-xl bg-lc-dark border border-lc-border p-6 shadow-xl',
  surface = 'custom',
  testId,
  layerClassName = 'z-50',
  role = 'dialog',
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  children,
}: ModalProps) {
  const panel = (
    <div
      role={role}
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      className={panelClassName}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
  return (
    <Overlay
      onClose={onClose}
      closeOnBackdrop={closeOnBackdrop}
      closeOnEscape={closeOnEscape}
      backdropClassName={`fixed inset-0 ${layerClassName} flex items-center justify-center bg-black/60`}
      portal
      testId={testId}
    >
      {surface === 'card' ? <Card variant="interactive" padding="none" asChild>{panel}</Card> : panel}
    </Overlay>
  );
}
