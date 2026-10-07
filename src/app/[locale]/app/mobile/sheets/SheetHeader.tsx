'use client';

import type { ReactNode } from 'react';
import BackButton from '../BackButton';

/**
 * `title`: the centred sheet title with its accent glyph and an optional help
 * line. `confirm`: a tinted icon circle, the title and a description, for a
 * sheet that asks before acting. `identity`: an avatar beside a name and a
 * mono line (the relay menu).
 */
export type SheetHeaderVariant = 'title' | 'confirm' | 'identity';

export interface SheetHeaderProps {
  title: ReactNode;
  /** The glyph beside the title, or the one in the confirm circle. */
  icon?: ReactNode;
  /** The help line (title), the description (confirm) or the mono line (identity). */
  subtitle?: ReactNode;
  /** A back chevron before the title, for a sheet with sub-views. */
  onBack?: () => void;
  backLabel?: string;
  /** Identity only: the avatar. */
  media?: ReactNode;
  variant?: SheetHeaderVariant;
  titleTestId?: string;
}

/**
 * The phone shell's one sheet header (mobile-shell.css). Every `<Sheet>`
 * renders this instead of its own title row (tests/components/modal-chrome.test.ts);
 * `SheetActions` is the matching footer. Renders a fragment, so the title and
 * the help line stay direct children of the sheet and keep its 14px gap.
 */
export default function SheetHeader({ title, icon, subtitle, onBack, backLabel, media, variant = 'title', titleTestId }: SheetHeaderProps) {
  if (variant === 'confirm') {
    return (
      <>
        {icon && <div className="confirm-sheet-icon" aria-hidden="true">{icon}</div>}
        <h2 className="confirm-sheet-title" data-testid={titleTestId}>{title}</h2>
        {subtitle !== undefined && <p className="confirm-sheet-desc">{subtitle}</p>}
      </>
    );
  }
  if (variant === 'identity') {
    return (
      <div className="sheet-identity">
        {media}
        <div className="sheet-identity-text">
          <h2 className="sheet-identity-name" data-testid={titleTestId}>{title}</h2>
          {subtitle !== undefined && <div className="sheet-identity-sub">{subtitle}</div>}
        </div>
      </div>
    );
  }
  return (
    <>
      <div className="sheet-title-row">
        {onBack && <BackButton onClick={onBack} label={backLabel} className="sheet-title-back" />}
        <h2 className="zap-title" data-testid={titleTestId}>{icon}{title}</h2>
      </div>
      {subtitle !== undefined && <p className="sheet-subtitle">{subtitle}</p>}
    </>
  );
}
