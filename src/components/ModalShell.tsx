'use client';

import { useEffect, type ReactNode } from 'react';

interface ModalShellProps {
  onClose: () => void;
  /**
   * If false, clicking the dark backdrop does nothing. Default true matches
   * the dominant UX — most modals in the app dismiss on outside click.
   */
  closeOnBackdrop?: boolean;
  /**
   * If false, Escape does nothing. Default true.
   */
  closeOnEscape?: boolean;
  /** Extra classes on the inner panel (sizing, radius, etc.). */
  panelClassName?: string;
  /** Identifies the backdrop in tests; individual modals add their own ids. */
  testId?: string;
  children: ReactNode;
}

/**
 * Shared shell for full-screen modals: dimmed backdrop + centered panel +
 * click-outside / Escape close wiring. Individual modals supply the panel
 * contents; chrome like close buttons, headings, and footers are the modal's
 * job since those vary.
 *
 * ~13 modals in the app each rolled their own version of this — all with
 * the same `fixed inset-0 z-50` + `onClick={onClose}` outer wrapper + inner
 * `onClick={(e) => e.stopPropagation()}` panel.
 */
export default function ModalShell({
  onClose,
  closeOnBackdrop = true,
  closeOnEscape = true,
  panelClassName = 'w-full max-w-lg mx-4 rounded-xl bg-lc-dark border border-lc-border p-6 shadow-xl',
  testId,
  children,
}: ModalShellProps) {
  useEffect(() => {
    if (!closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeOnEscape, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={closeOnBackdrop ? onClose : undefined}
      data-testid={testId}
    >
      <div className={panelClassName} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
