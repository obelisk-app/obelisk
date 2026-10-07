'use client';

import { useRef, type KeyboardEvent } from 'react';

/** Where each key moves the selection in a bar of `n` tabs: arrows wrap, Home and End jump. */
const NEXT_KEY: Record<string, (i: number, n: number) => number> = {
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowDown: (i, n) => (i + 1) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  ArrowUp: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_i, n) => n - 1,
};

/**
 * The SegmentedControl's keyboard: arrow keys and Home/End select the next
 * tab and move focus to it, as a `tablist` should.
 */
export function useSegmentedControl<V extends string>(
  options: ReadonlyArray<{ value: V }>,
  value: V,
  onChange: (next: V) => void,
) {
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const step = NEXT_KEY[e.key];
    if (!step || options.length === 0) return;
    e.preventDefault();
    const current = Math.max(0, options.findIndex((o) => o.value === value));
    const next = step(current, options.length);
    onChange(options[next].value);
    tabs.current[next]?.focus();
  };
  const tabRef = (i: number) => (node: HTMLButtonElement | null) => {
    tabs.current[i] = node;
  };
  return { onKeyDown, tabRef };
}
