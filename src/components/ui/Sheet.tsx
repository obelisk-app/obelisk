'use client';

import type { CSSProperties, FormEventHandler, ReactNode } from 'react';
import { useDismiss } from '@/hooks/useDismiss';

export type SheetHeight = '88%' | '92%' | '94%';

export interface SheetProps {
  onClose: () => void;
  /** `data-screen` on the host; the mobile shell keys CSS and tests on it. */
  screen: string;
  /** Accessible name of the dialog; the sheet's own title text. */
  label: string;
  testId?: string;
  /** Overrides the stylesheet's 88% cap on the panel. */
  maxHeight?: SheetHeight;
  /** A sheet opened over another sheet sits above it. */
  zIndex?: number;
  /** `form` makes the panel a form so Enter submits. */
  as?: 'div' | 'form';
  onSubmit?: FormEventHandler<HTMLFormElement>;
  /** If false, Escape does nothing. Default true. */
  closeOnEscape?: boolean;
  /**
   * A second sheet opened over this one. It is a sibling of the panel inside
   * the host, so it covers this sheet instead of scrolling with it.
   */
  stacked?: ReactNode;
  children: ReactNode;
}

/**
 * The mobile bottom sheet: `.sheet-host` > `.sheet-backdrop` + `.sheet`,
 * with the drag handle. Dismissal is shared with Modal through Overlay's
 * Escape hook; the hand-rolled sheets closed only on a backdrop tap.
 *
 * Not portalled on purpose: every one of these classes is scoped under
 * `.obelisk-mobile`, which `document.body` is outside of.
 */
export default function Sheet({
  onClose,
  screen,
  label,
  testId,
  maxHeight,
  zIndex,
  as = 'div',
  onSubmit,
  closeOnEscape = true,
  stacked,
  children,
}: SheetProps) {
  useDismiss({ onDismiss: onClose, enabled: closeOnEscape, outside: 'none' });
  const hostStyle: CSSProperties | undefined = zIndex === undefined ? undefined : { zIndex };
  const panel = {
    className: 'sheet native-scroll-y',
    style: maxHeight === undefined ? undefined : ({ maxHeight } as CSSProperties),
    role: 'dialog',
    'aria-modal': true,
    'aria-label': label,
  } as const;
  const body = (
    <>
      <div className="sheet-handle" />
      {children}
    </>
  );
  return (
    <div className="sheet-host" data-screen={screen} data-testid={testId} style={hostStyle}>
      <div className="sheet-backdrop" onClick={onClose} />
      {as === 'form' ? <form {...panel} onSubmit={onSubmit}>{body}</form> : <div {...panel}>{body}</div>}
      {stacked}
    </div>
  );
}
