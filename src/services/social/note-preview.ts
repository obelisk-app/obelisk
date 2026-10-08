/**
 * Just enough of another note to name it in one line.
 *
 * Two surfaces ask the same question and neither wants the whole event: the
 * "Replying to …" line above a reply, and the inline chip for a
 * `nostr:nevent…` reference. Both were printing a truncated hex id, which
 * tells a reader nothing about what is being pointed at: it is the id of a
 * thing, not the thing.
 *
 * The fetch is shared and cached process-wide, because a feed of replies asks
 * about the same parent many times over and each miss is a relay round trip.
 * Misses are cached too: a parent nobody still hosts should be asked about
 * once, not once per card that mentions it.
 *
 * The React side is `useNotePreview` in `src/hooks/social/`.
 */

import { registerRuntimeCache } from '@/services/local-data/runtime-caches';
import { NOTE_PREVIEW_CACHE_LIMIT } from '@/constants/social/cache';
import { fetchNote } from '@nostr-wot/data';

export interface NotePreview {
  id: string;
  pubkey: string;
  content: string;
}

/** Resolved previews and the in-flight promises, keyed by event id. */
const cache = new Map<string, NotePreview | null>();
const inflight = new Map<string, Promise<NotePreview | null>>();

let generation = 0;

/** Invalidate results and detach outstanding requests from the next account. */
export function __resetNotePreviewCache(): void {
  generation++;
  cache.clear();
  inflight.clear();
}

export function getCachedNotePreview(id: string): NotePreview | null | undefined {
  const value = cache.get(id);
  if (value !== undefined) {
    cache.delete(id);
    cache.set(id, value);
  }
  return value;
}

/** Fetch (once, shared) the preview of `id`; a miss is cached as `null`. */
export async function loadNotePreview(id: string, relays?: readonly string[]): Promise<NotePreview | null> {
  const existing = inflight.get(id);
  if (existing) return existing;

  const requestGeneration = generation;
  const promise = fetchNote(id, relays ? [...relays] : undefined)
    .then((entry) => {
      const preview = entry
        ? { id: entry.id, pubkey: entry.pubkey, content: entry.content }
        : null;
      if (generation !== requestGeneration) return null;
      rememberPreview(id, preview);
      return preview;
    })
    .catch(() => {
      // A relay that refused is not proof the note is gone, but retrying on
      // every render would be worse. One attempt per session.
      if (generation === requestGeneration) rememberPreview(id, null);
      return null;
    })
    .finally(() => { if (inflight.get(id) === promise) inflight.delete(id); });

  inflight.set(id, promise);
  return promise;
}

function rememberPreview(id: string, preview: NotePreview | null): void {
  cache.delete(id);
  cache.set(id, preview);
  while (cache.size > NOTE_PREVIEW_CACHE_LIMIT) cache.delete(cache.keys().next().value!);
}

registerRuntimeCache({
  id: 'social-note-previews', category: 'channels', scope: 'account', sensitive: true,
  inspect: () => ({ entries: cache.size, pending: inflight.size }),
  invalidate: __resetNotePreviewCache,
});
