'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { fetchNote, fetchThread, type NoteEntry } from '@nostr-wot/data';
import { KIND_NOTE } from '@/services/social/kinds';
import { parentIdOf } from '@/services/social/feed';

/** The SDK returns a lighter NoteEntry; the UI wants real events. */
export function toEvent(entry: NoteEntry): NostrEvent {
  return {
    id: entry.id,
    pubkey: entry.pubkey,
    content: entry.content,
    created_at: entry.createdAt,
    tags: entry.tags,
    kind: KIND_NOTE,
    sig: '',
  };
}

/** Walk up the reply chain, bounded so a malicious chain can't spin forever. */
const MAX_ANCESTORS = 8;

type ThreadState = {
  /** The note this state describes; state for any other note reads as fresh. */
  noteId: string;
  root: NostrEvent | null;
  ancestors: NostrEvent[];
  replies: NostrEvent[];
  loading: boolean;
  error: boolean;
};

const NO_EVENTS: NostrEvent[] = [];

const freshThread = (noteId: string): ThreadState => ({
  noteId, root: null, ancestors: NO_EVENTS, replies: NO_EVENTS, loading: true, error: false,
});

/**
 * One note with the chain it answers (oldest first) and its replies.
 * Replies are optional context: failing to fetch them is not an error.
 */
export function useNoteThread(noteId: string) {
  // One state object, tagged with the note it describes. A note change is
  // then visible on the very next render (state tagged with another id
  // reads as a fresh thread) instead of being reset by an effect one render
  // later, and nothing a previous note's chains deliver late can land in
  // this one.
  const [thread, setThread] = useState<ThreadState>(() => freshThread(noteId));
  const { root, ancestors, replies, loading, error } =
    thread.noteId === noteId ? thread : freshThread(noteId);

  const patch = useCallback((next: Partial<Omit<ThreadState, 'noteId'>>) => {
    setThread((prev) => (
      prev.noteId === noteId ? { ...prev, ...next } : { ...freshThread(noteId), ...next }
    ));
  }, [noteId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const entry = await fetchNote(noteId);
      if (cancelled) return;
      if (!entry) {
        patch({ error: true, loading: false });
        return;
      }
      const note = toEvent(entry);
      patch({ root: note, loading: false });

      // Parent chain, oldest first.
      const chain: NostrEvent[] = [];
      let cursor: string | null = parentIdOf(note);
      const seen = new Set<string>([note.id]);
      while (cursor && chain.length < MAX_ANCESTORS && !seen.has(cursor)) {
        seen.add(cursor);
        const parent: NoteEntry | null = await fetchNote(cursor);
        if (cancelled || !parent) break;
        const parentEvent = toEvent(parent);
        chain.unshift(parentEvent);
        cursor = parentIdOf(parentEvent);
      }
      if (!cancelled) patch({ ancestors: chain });
    })().catch(() => {
      if (!cancelled) patch({ error: true, loading: false });
    });

    fetchThread(noteId)
      .then((entries) => {
        if (cancelled) return;
        patch({ replies: entries.map(toEvent).filter((reply) => reply.id !== noteId) });
      })
      .catch(() => { /* replies are optional context, not an error state */ });

    return () => { cancelled = true; };
  }, [noteId, patch]);

  // A reply this reader just published shows at once, before any relay echo.
  const addReply = (event: NostrEvent) => setThread((prev) => ({ ...prev, replies: [...prev.replies, event] }));

  return { root, ancestors, replies, loading, error, addReply };
}
