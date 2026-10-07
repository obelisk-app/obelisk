import { useCallback, useLayoutEffect, type InputEvent, type RefObject } from 'react';
import { autosizeHeight } from '@/utils/common/autosize';

type InputHandler = (e: InputEvent<HTMLTextAreaElement>) => void;

/** `fixed` keeps the `rows` height; `auto` grows with the text, up to `maxRows` when set. */
export type TextAreaHeight = 'fixed' | 'auto';

function px(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function fit(el: HTMLTextAreaElement, maxRows: number | undefined): void {
  const style = window.getComputedStyle(el);
  el.style.height = 'auto';
  const fontSize = px(style.fontSize) || 14;
  const { height, overflow } = autosizeHeight({
    scrollHeight: el.scrollHeight,
    lineHeight: px(style.lineHeight) || fontSize * 1.5,
    paddingY: px(style.paddingTop) + px(style.paddingBottom),
    borderY: px(style.borderTopWidth) + px(style.borderBottomWidth),
    maxRows,
  });
  el.style.height = `${height}px`;
  el.style.overflowY = overflow ? 'auto' : 'hidden';
}

/**
 * Grows a textarea to fit its text. Re-measures when the controlled `value`
 * changes and on every `input` event, so uncontrolled fields grow too; the
 * returned handler wraps the caller's own `onInput`.
 */
export function useAutosizeTextArea(
  ref: RefObject<HTMLTextAreaElement | null>,
  height: TextAreaHeight,
  value: unknown,
  maxRows: number | undefined,
  onInput: InputHandler | undefined,
): InputHandler | undefined {
  useLayoutEffect(() => {
    if (height === 'auto' && ref.current) fit(ref.current, maxRows);
  }, [ref, height, value, maxRows]);

  const handler = useCallback(
    (e: InputEvent<HTMLTextAreaElement>) => {
      fit(e.currentTarget, maxRows);
      onInput?.(e);
    },
    [maxRows, onInput],
  );
  return height === 'auto' ? handler : onInput;
}
