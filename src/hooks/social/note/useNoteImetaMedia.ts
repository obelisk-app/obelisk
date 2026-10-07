import { useMemo } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { parseImeta } from '@/services/social/imeta';

/** A picture or video note's media, from its `imeta` tags, parsed once per note. */
export function useNoteImetaMedia(note: NostrEvent) {
  const media = useMemo(() => [...parseImeta(note).values()], [note]);
  return { media };
}
