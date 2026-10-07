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
import { sameNoteCardProps, type NoteCardProps } from '@/utils/social/note-card';
import RepostCard from './RepostCard';
import PlainNoteCard from './PlainNoteCard';

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
export default memo(NoteCardInner, sameNoteCardProps);

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
