import type { Event as NostrEvent } from 'nostr-tools';
import { mediaUrls } from '@/services/social/profile-feed';
import { parseImeta } from '@/services/social/imeta';

/** One tile of `MediaGrid`: the profile feed and the feed screen's Media filter both build these. */
export type MediaItem = {
  key: string;
  url: string;
  multiple?: boolean;
  /** Where the tile came from, when the host opens the post rather than the image. */
  noteId?: string;
};

/**
 * Grid tiles for the Media filter.
 *
 * Media tiles carry the id of the note they came from, so a tap opens the
 * post rather than a bare image with no author and no way to reply.
 */
export function feedMediaItems(notes: readonly NostrEvent[]): MediaItem[] {
  return notes.flatMap((note) => {
    const imeta = [...parseImeta(note).values()].map((item) => item.url);
    const urls = [...new Set([...imeta, ...mediaUrls(note)])];
    return urls.map((url) => ({
      key: `${note.id}:${url}`,
      url,
      noteId: note.id,
      multiple: urls.length > 1,
    }));
  });
}
