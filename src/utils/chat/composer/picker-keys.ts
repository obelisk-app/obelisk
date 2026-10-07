import type { Dispatch, KeyboardEvent, SetStateAction } from 'react';

/** One open picker (slash commands or mentions) as the keyboard sees it. */
export interface PickerNav {
  open: boolean;
  count: number;
  setIndex: Dispatch<SetStateAction<number>>;
  choose: () => void;
  close: () => void;
}

/**
 * Arrow keys move through an open, non-empty picker (wrapping), Enter or Tab
 * chooses, Escape closes. Returns whether the key was the picker's, so the
 * caller can fall through to the next picker and then to send-on-Enter.
 */
export function navigatePicker(e: KeyboardEvent<HTMLElement>, nav: PickerNav): boolean {
  if (!nav.open || nav.count === 0) return false;
  const n = nav.count;
  if (e.key === 'ArrowDown') { e.preventDefault(); nav.setIndex((i) => (i + 1) % n); return true; }
  if (e.key === 'ArrowUp') { e.preventDefault(); nav.setIndex((i) => (i - 1 + n) % n); return true; }
  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); nav.choose(); return true; }
  if (e.key === 'Escape') { e.preventDefault(); nav.close(); return true; }
  return false;
}
