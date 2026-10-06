import { cn } from './cn';

export type DividerSpacing = 'none' | 'sm' | 'md';

const SPACING_CLASS: Record<DividerSpacing, string> = {
  none: '',
  sm: 'my-1',
  md: 'my-3',
};

export interface DividerProps {
  spacing?: DividerSpacing;
  className?: string;
}

/**
 * A 1px `lc-border` rule. Decorative, so it is hidden from assistive tech;
 * sections that need a semantic boundary should use a heading instead.
 */
export default function Divider({ spacing = 'none', className }: DividerProps) {
  return <div className={cn('h-px bg-lc-border', SPACING_CLASS[spacing], className)} aria-hidden="true" />;
}
