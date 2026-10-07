import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/utils/style/cn';

/** `content` sizes the bar to its options; `fill` stretches it and shares the width equally. */
export type SegmentedFit = 'content' | 'fill';

export interface SegmentedOption<V extends string> {
  value: V;
  label: ReactNode;
  /** Tooltip, for context that is not worth a line of text (a count, say). */
  title?: string;
  testId?: string;
}

export interface SegmentedControlProps<V extends string> {
  options: ReadonlyArray<SegmentedOption<V>>;
  value: V;
  onChange: (next: V) => void;
  /** The tab list's accessible name. */
  'aria-label': string;
  fit?: SegmentedFit;
  className?: string;
}

const NEXT_KEY: Record<string, (i: number, n: number) => number> = {
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowDown: (i, n) => (i + 1) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  ArrowUp: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_i, n) => n - 1,
};

/**
 * One switcher for the six tab bars that drew three different selected
 * looks. It is the stylesheet's `.lc-segment` pill (selected state keyed off
 * `aria-selected`, in the button colour), rendered as a real `tablist`:
 * one tab stop, arrow keys and Home/End move the selection.
 */
export default function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  fit = 'content',
  className,
}: SegmentedControlProps<V>) {
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = NEXT_KEY[e.key];
    if (!step || options.length === 0) return;
    e.preventDefault();
    const current = Math.max(0, options.findIndex((o) => o.value === value));
    const next = step(current, options.length);
    onChange(options[next].value);
    tabs.current[next]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn('lc-segment', fit === 'fill' && 'w-full', className)}
    >
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => { tabs.current[i] = node; }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn('lc-segment-item focus:outline-none focus-visible:ring-2 focus-visible:ring-lc-green/60', fit === 'fill' && 'flex-1 justify-center')}
            data-testid={option.testId}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
