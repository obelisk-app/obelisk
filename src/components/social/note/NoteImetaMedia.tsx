'use client';

import type { Event as NostrEvent } from 'nostr-tools';
import { useNoteImetaMedia } from '@/hooks/social/note/useNoteImetaMedia';
import MediaCarousel from './MediaCarousel';

/**
 * The media of a picture or video note. A set is a carousel, not a stack:
 * four images stacked meant the note owned the viewport and everything
 * after it was a scroll away.
 */
export default function NoteImetaMedia({ note }: { note: NostrEvent }) {
  const { media } = useNoteImetaMedia(note);
  return (
    <div className="mt-2" data-testid="note-imeta-media">
      <MediaCarousel items={media} />
    </div>
  );
}
