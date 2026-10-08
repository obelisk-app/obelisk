import type { ReactNode } from 'react';
import Text from '../layout/Text';
import Button, { type ButtonProps } from '../buttons/Button';
import { cn } from '@/utils/style/cn';

export interface ToggleCardProps extends Omit<ButtonProps, 'title' | 'children' | 'variant' | 'size' | 'tone' | 'type' | 'aria-pressed'> {
  active: boolean;
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
}

/** Selectable card with a visible and announced pressed state. The caller owns selection. */
export default function ToggleCard({ active, icon, title, subtitle, className, ...rest }: ToggleCardProps) {
  return (
    <Button
      {...rest}
      variant="bare"
      type="button"
      aria-pressed={active}
      className={cn(
        'flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
        active ? 'border-lc-green bg-lc-green/10 text-lc-white' : 'border-lc-border bg-lc-black hover:border-lc-muted text-lc-white/80',
        className,
      )}
    >
      {icon && <div aria-hidden="true" className="text-xl leading-none">{icon}</div>}
      <div className="min-w-0 flex-1">
        <Text as="div" size="sm" weight="semibold">{title}</Text>
        {subtitle && <Text as="div" size="11" tone="muted">{subtitle}</Text>}
      </div>
      <div aria-hidden="true" className={cn('mt-0.5 h-4 w-4 shrink-0 rounded-full border', active ? 'border-lc-green bg-lc-green' : 'border-lc-border')} />
    </Button>
  );
}
