'use client';

import type { ReactNode } from 'react';
import IconButton from '@/components/ui/buttons/IconButton';

/** One tool in the mobile composer's row above the keyboard. */
export default function ComposerToolButton({
  label,
  onClick,
  children,
  disabled = false,
  pressed,
  testId,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  pressed?: boolean;
  testId: string;
}) {
  return (
    <IconButton
      // 40px square: the smallest thing a thumb hits reliably.
      size="10"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className="active:bg-white/10"
      data-testid={testId}
    >
      {children}
    </IconButton>
  );
}
