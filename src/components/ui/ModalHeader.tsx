'use client';

import type { ReactNode } from 'react';
import CloseButton from './CloseButton';
import { cn } from './cn';

export interface ModalHeaderProps {
  title: ReactNode;
  /** One line under the title, muted. */
  subtitle?: ReactNode;
  onClose: () => void;
  /** Extra controls between the title and the close button. */
  children?: ReactNode;
  className?: string;
}

/**
 * Title (+ subtitle) on the left, a close button on the right, hairline
 * below: the header eight desktop modals each hand-rolled. The close button
 * is `CloseButton` (the icon, not the glyph), so it has the focus ring and
 * the `type` the copies lacked.
 */
export default function ModalHeader({ title, subtitle, onClose, children, className }: ModalHeaderProps) {
  return (
    <header className={cn('flex shrink-0 items-center justify-between gap-4 border-b border-lc-border px-5 py-3', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-bold text-lc-white">{title}</h2>
        {subtitle !== undefined && <p className="text-xs text-lc-muted">{subtitle}</p>}
      </div>
      {children}
      <CloseButton onClick={onClose} />
    </header>
  );
}
