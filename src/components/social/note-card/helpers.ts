import type { MouseEvent } from 'react';

/** Above this many characters a note is collapsed behind "Show more". */
export const LONG_NOTE_CHARS = 1000;

/**
 * Turn a bare `onOpenNote` into a card-body click handler.
 *
 * Guarded rather than wrapped in a button, because a card is full of real
 * controls (author, tags, media, the action row) and a button can't legally
 * contain them. A drag that selects text is not a click either.
 */
export function bodyClickHandler(
  onOpen: (() => void) | undefined,
): ((event: MouseEvent<HTMLElement>) => void) | undefined {
  if (!onOpen) return undefined;
  return (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('a, button, input, textarea, video, audio, [role="button"], [data-no-thread]')) return;
    if (window.getSelection()?.toString()) return;
    onOpen();
  };
}
