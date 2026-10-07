'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/style/cn';
import { ChevronLeftIcon } from '@/assets/icons';

export interface BackButtonProps {
  onClick: () => void;
  /** Accessible name; defaults to the translated "Back". */
  label?: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  'data-testid'?: string;
}

/**
 * The mobile shell's round back button (`.back-btn` in mobile-shell.css,
 * which sizes the chevron to 20px). It stays on the stylesheet system rather
 * than the desktop `Button`; this only stops nine screens pasting the same
 * chevron. Stroke 2 matches the inline SVG it replaced.
 */
export default function BackButton({ onClick, label, className, style, disabled, 'data-testid': testId }: BackButtonProps) {
  const t = useTranslations();
  return (
    <button
      type="button"
      className={cn('back-btn', className)}
      onClick={onClick}
      style={style}
      disabled={disabled}
      aria-label={label ?? t('common.back')}
      data-testid={testId}
    >
      <ChevronLeftIcon strokeWidth={2} />
    </button>
  );
}
