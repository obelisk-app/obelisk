import { useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useCurrentRelayUrl } from '@/services/nostr-bridge';
import type { renderModeFor } from '@/services/social/kinds';
import { groupNoteUrl } from '@/services/social/note-links';
import { LONG_NOTE_CHARS } from '@/constants/social/note-card';
import { tagValue } from '@/utils/social/note-tags';

/**
 * What a card body needs beyond the note itself: the way back to a group
 * message's room, a highlight's source, a NIP-94 file's url and type, and
 * whether a long note is clamped behind "Show more".
 */
export function useNoteBody({ note, mode }: { note: NostrEvent; mode: ReturnType<typeof renderModeFor> }) {
  const activeRelay = useCurrentRelayUrl();
  const [expanded, setExpanded] = useState(false);
  // A long note shouldn't push the next ten posts off the screen. The
  // threshold is on raw length rather than measured height so the decision is
  // stable across reflows and doesn't need a layout pass.
  const isLong = note.content.length > LONG_NOTE_CHARS;

  return {
    groupHref: mode === 'group' ? groupNoteUrl(note, activeRelay) : null,
    /** A highlight (kind 9802) quotes someone else's words; `r` is where from. */
    highlightSource: tagValue(note, 'r'),
    /** NIP-94: the file is in tags, the content is a description. */
    fileUrl: tagValue(note, 'url'),
    fileMimeType: tagValue(note, 'm') ?? null,
    isLong,
    expanded,
    clamped: isLong && !expanded,
    toggleExpanded: () => setExpanded((value) => !value),
  };
}
