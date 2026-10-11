/** The parts of a keydown the composer's Enter rule reads. */
export interface EnterKeyLike {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** An IME is mid-composition: its Enter confirms the candidate. */
  isComposing?: boolean;
}

/**
 * What Enter does in the multi-line channel composer:
 *
 * - plain Enter sends;
 * - Shift+Enter is a line break the textarea inserts itself (`native`);
 * - Ctrl+Enter / Cmd+Enter is a line break too, but a textarea ignores it,
 *   so the composer inserts it (`newline`);
 * - anything else (another key, Alt+Enter, an IME confirming a candidate)
 *   is not the composer's (`null`).
 */
export function composerEnterAction(e: EnterKeyLike): 'send' | 'newline' | 'native' | null {
  if (e.key !== 'Enter' || e.isComposing || e.altKey) return null;
  if (e.shiftKey) return 'native';
  if (e.ctrlKey || e.metaKey) return 'newline';
  return 'send';
}

/** The draft with a line break replacing the selection, and the caret after it. */
export function insertLineBreak(draft: string, start: number, end: number): { value: string; caret: number } {
  return { value: `${draft.slice(0, start)}\n${draft.slice(end)}`, caret: start + 1 };
}
