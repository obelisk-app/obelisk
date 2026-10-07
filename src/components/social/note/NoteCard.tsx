'use client';

/**
 * One row in a feed.
 *
 * Replaces the two-button row in the old `ProfileNote` (reply + a
 * fire-and-forget heart with no count). This carries the full action set
 * (reply, repost, quote, react, zap), each with the live count from
 * `fetchEngagement`, plus the rendering modes a feed needs so posts from
 * Amethyst and Primal don't show up as "unsupported".
 */

import { memo } from 'react';
import { isRepost } from '@/services/social/repost';
import RepostCard from './RepostCard';
import PlainNoteCard from './PlainNoteCard';
import type { Event as NostrEvent } from 'nostr-tools';

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
 * Memoised on the note identity and the handlers.
 *
 * A feed holds hundreds of these. Any state change in the parent (a page
 * arriving, the live tail buffering, the moderation store ticking) used to
 * re-render every card, and each card does real work on render: parsing
 * imeta, tokenising `nostr:` references, scanning tags for content warnings.
 * The note itself is immutable once received, so re-running that is pure
 * waste.
 */
export default memo(NoteCardInner, (prev, next) => (
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
));

function NoteCardInner(props: NoteCardProps) {
  const { note } = props;

  // A repost is a wrapper, not content: rendering its `content` as text shows
  // the reader a wall of raw JSON.
  if (isRepost(note) && !props.nested && props.variant !== 'quoted') {
    return <RepostCard {...props} />;
  }
  return <PlainNoteCard {...props} />;
}

export { NoteCardInner };
