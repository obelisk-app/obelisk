'use client';

import type { ButtonHTMLAttributes } from 'react';
import { useTranslations } from 'next-intl';
import Button from './Button';
import { cn } from '@/utils/style/cn';
import { CloseIcon } from './icons';

/**
 * Square footprints. `md` (32px) is what the `✕` glyph button occupied in a
 * modal header (16px glyph line plus `p-1`), so swapping the glyph for the
 * icon does not change the header's height. `sm` (24px) is for list rows.
 */
export type CloseButtonSize = 'sm' | 'md';

const SIZE: Record<CloseButtonSize, { box: string; icon: number }> = {
  sm: { box: 'h-6 w-6', icon: 14 },
  md: { box: 'h-8 w-8', icon: 16 },
};

export interface CloseButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> {
  onClick: () => void;
  size?: CloseButtonSize;
  /** Accessible name; defaults to the translated "Close". */
  label?: string;
}

/** The dismiss button: a ghost icon Button with `CloseIcon`, never the `✕` glyph. */
export default function CloseButton({ onClick, size = 'md', label, className, ...rest }: CloseButtonProps) {
  const t = useTranslations();
  const spec = SIZE[size];
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={label ?? t('common.close')}
      className={cn(spec.box, 'shrink-0', className)}
      {...rest}
    >
      <CloseIcon size={spec.icon} />
    </Button>
  );
}
