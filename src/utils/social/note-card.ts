import type { MouseEvent } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';

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

/** The props of a feed row, shared by the two shapes it renders (`PlainNoteCard`, `RepostCard`). */
export type NoteCardProps = {
  note: NostrEvent;
  onOpenProfile?: (pubkey: string) => void;
  onOpenNote?: (id: string) => void;
  onReply?: (note: NostrEvent) => void;
  onQuote?: (note: NostrEvent) => void;
  onZap?: (note: NostrEvent) => void;
  onOpenArticle?: (note: NostrEvent) => void;
  /** Hashtags open in-app (the feed's search) instead of leaving for /t. */
  onOpenTag?: (tag: string) => void;
  /**
   * Everyone who reposted this note, newest first. A repost row renders the
   * whole list; without it "eight people reposted this" reads as one
   * anonymous row, which throws away the only signal a repost carries.
   */
  reposters?: readonly string[];
  /**
   * `full`: a normal row with the whole action set.
   * `quoted`: a bordered box with no actions, for a note embedded inside
   *   another note's body (you act on the outer note, not the quoted one).
   *
   * These used to be one `embedded` boolean, which conflated "draw it as a
   * box" with "no actions". A repost needs the first and NOT the second: the
   * whole point is to reply to, like or zap the note that was reposted.
   */
  variant?: 'full' | 'quoted';
  /** Parent already supplies the outer padding (repost attribution wrapper). */
  nested?: boolean;
};

/**
 * The note card's memo comparison: the same note, variant and handlers.
 *
 * A feed holds hundreds of cards, and the note itself is immutable once
 * received, so a parent re-render (a page arriving, the live tail
 * buffering) must not re-run each card's imeta parsing and `nostr:`
 * tokenising.
 */
export function sameNoteCardProps(prev: NoteCardProps, next: NoteCardProps): boolean {
  return (
    prev.note.id === next.note.id
    && prev.variant === next.variant
    && prev.nested === next.nested
    && prev.onReply === next.onReply
    && prev.onQuote === next.onQuote
    && prev.onZap === next.onZap
    && prev.onOpenNote === next.onOpenNote
    && prev.onOpenProfile === next.onOpenProfile
    && prev.onOpenArticle === next.onOpenArticle
    && prev.onOpenTag === next.onOpenTag
    // Compared by length: the list is rebuilt each page, so reference equality
    // would defeat the memo, and reposters only ever grow for a given note.
    && (prev.reposters?.length ?? 0) === (next.reposters?.length ?? 0)
  );
}
