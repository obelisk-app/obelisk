'use client';

import { useEffect, useState } from 'react';
import { getCachedNotePreview, loadNotePreview, type NotePreview } from '@/services/social/note-preview';

/**
 * `undefined` while loading, `null` once it is known to be unreachable.
 * The distinction matters: a skeleton and a "couldn't find it" are different
 * things to show.
 *
 * The shared cache answers on every render and a fetched answer is stamped
 * with its id, so a card handed another id shows that note (or a skeleton)
 * from its first render, never the previous note's text.
 */
export function useNotePreview(
  id: string | null | undefined,
  relayHints?: readonly string[],
): NotePreview | null | undefined {
  const [fetched, setFetched] = useState<{ id: string; preview: NotePreview | null } | null>(null);

  // Relay hints are advisory; joining them keeps the effect from re-running
  // on a fresh array with identical contents every render.
  const hintKey = relayHints?.join(',') ?? '';

  useEffect(() => {
    if (!id || getCachedNotePreview(id) !== undefined) return;
    let live = true;
    void loadNotePreview(id, hintKey ? hintKey.split(',') : undefined).then((preview) => {
      if (live) setFetched({ id, preview });
    });
    return () => { live = false; };
  }, [id, hintKey]);

  if (!id) return undefined;
  const cached = getCachedNotePreview(id);
  if (cached !== undefined) return cached;
  return fetched && fetched.id === id ? fetched.preview : undefined;
}
