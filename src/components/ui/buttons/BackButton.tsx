'use client';

import Button from '@/components/ui/buttons/Button';
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
 * The phone-style back button for screens and sheets. The shared button owns
 * keyboard behavior; mobile-shell.css keeps the round .back-btn geometry.
 */
export default function BackButton({ onClick, label, className, style, disabled, 'data-testid': testId }: BackButtonProps) {
  const t = useTranslations();
  return (
    <Button
      variant="bare"
      type="button"
      className={cn('back-btn', className)}
      onClick={onClick}
      style={style}
      disabled={disabled}
      aria-label={label ?? t('common.back')}
      data-testid={testId}
    >
      <ChevronLeftIcon strokeWidth={2} />
    </Button>
  );
}
