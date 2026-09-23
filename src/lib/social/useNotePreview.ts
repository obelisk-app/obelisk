'use client';

/**
 * Just enough of another note to name it in one line.
 *
 * Two surfaces ask the same question and neither wants the whole event: the
 * "Replying to …" line above a reply, and the inline chip for a
 * `nostr:nevent…` reference. Both were printing a truncated hex id, which
 * tells a reader nothing about what is being pointed at — it is the id of a
 * thing, not the thing.
 *
 * The fetch is shared and cached process-wide, because a feed of replies asks
 * about the same parent many times over and each miss is a relay round trip.
 * Misses are cached too: a parent nobody still hosts should be asked about
 * once, not once per card that mentions it.
 */

import { useEffect, useState } from 'react';
import { fetchNote } from '@nostr-wot/data';

export interface NotePreview {
  id: string;
  pubkey: string;
  content: string;
}

/** Resolved previews and the in-flight promises, keyed by event id. */
const cache = new Map<string, NotePreview | null>();
const inflight = new Map<string, Promise<NotePreview | null>>();

/** Exposed for tests; the app has no reason to drop this. */
export function __resetNotePreviewCache(): void {
  cache.clear();
  inflight.clear();
}

export function getCachedNotePreview(id: string): NotePreview | null | undefined {
  return cache.get(id);
}

async function load(id: string, relays?: readonly string[]): Promise<NotePreview | null> {
  const existing = inflight.get(id);
  if (existing) return existing;

  const promise = fetchNote(id, relays ? [...relays] : undefined)
    .then((entry) => {
      const preview = entry
        ? { id: entry.id, pubkey: entry.pubkey, content: entry.content }
        : null;
      cache.set(id, preview);
      return preview;
    })
    .catch(() => {
      // A relay that refused is not proof the note is gone, but retrying on
      // every render would be worse. One attempt per session.
      cache.set(id, null);
      return null;
    })
    .finally(() => { inflight.delete(id); });

  inflight.set(id, promise);
  return promise;
}

/**
 * `undefined` while loading, `null` once it is known to be unreachable.
 * The distinction matters: a skeleton and a "couldn't find it" are different
 * things to show.
 */
export function useNotePreview(
  id: string | null | undefined,
  relayHints?: readonly string[],
): NotePreview | null | undefined {
  const [preview, setPreview] = useState<NotePreview | null | undefined>(
    () => (id ? cache.get(id) : undefined),
  );

  // Relay hints are advisory; joining them keeps the effect from re-running
  // on a fresh array with identical contents every render.
  const hintKey = relayHints?.join(',') ?? '';

  useEffect(() => {
    if (!id) {
      setPreview(undefined);
      return;
    }
    const cached = cache.get(id);
    if (cached !== undefined) {
      setPreview(cached);
      return;
    }

    let live = true;
    setPreview(undefined);
    void load(id, hintKey ? hintKey.split(',') : undefined).then((result) => {
      if (live) setPreview(result);
    });
    return () => { live = false; };
  }, [id, hintKey]);

  return preview;
}
