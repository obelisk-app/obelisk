'use client';

/**
 * A note with its context: the parent chain above it and the replies below.
 *
 * The old "Replies" tab showed a user's replies with no sign of what they
 * were replying to, which made half the feed unreadable. `fetchThread` from
 * the SDK does the heavy query; `fetchNote` walks the parent chain.
 */

import { useEffect, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { fetchNote, fetchThread, type NoteEntry } from '@nostr-wot/data';
import { useTranslation } from '@/i18n/context';
import { KIND_NOTE } from '@/lib/social/kinds';
import { parentIdOf } from '@/lib/social/feed';
import NoteCard from './NoteCard';
import NoteComposer from './NoteComposer';
import { useMyPubkey } from '@/lib/nostr-bridge';

/** The SDK returns a lighter NoteEntry; the UI wants real events. */
function toEvent(entry: NoteEntry): NostrEvent {
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

export default function NoteThread({
  noteId,
  onOpenProfile,
  onOpenNote,
}: {
  noteId: string;
  onOpenProfile?: (pubkey: string) => void;
  onOpenNote?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const myPubkey = useMyPubkey();
  const [root, setRoot] = useState<NostrEvent | null>(null);
  const [ancestors, setAncestors] = useState<NostrEvent[]>([]);
  const [replies, setReplies] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);


  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setAncestors([]);
    setReplies([]);

    (async () => {
      const entry = await fetchNote(noteId);
      if (cancelled) return;
      if (!entry) {
        setError(true);
        setLoading(false);
        return;
      }
      const note = toEvent(entry);
      setRoot(note);
      setLoading(false);

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
      if (!cancelled) setAncestors(chain);
    })().catch(() => {
      if (!cancelled) {
        setError(true);
        setLoading(false);
      }
    });

    fetchThread(noteId)
      .then((entries) => {
        if (cancelled) return;
        setReplies(entries.map(toEvent).filter((reply) => reply.id !== noteId));
      })
      .catch(() => { /* replies are optional context, not an error state */ });

    return () => { cancelled = true; };
  }, [noteId]);

  if (loading) {
    return (
      <div className="space-y-3 p-4" data-testid="thread-loading">
        {[0, 1].map((item) => <div key={item} className="lc-skeleton h-24 rounded-xl" />)}
      </div>
    );
  }

  if (error || !root) {
    return (
      <p className="p-6 text-center text-sm text-lc-muted" data-testid="thread-error">
        {t('social.noteNotFound')}
      </p>
    );
  }

  return (
    /*
      No `max-h`/`overflow` of its own any more: every host that renders a
      thread — the inline reader, the desktop pane, the phone screen —
      already scrolls, so this capped the conversation at 70% of the
      viewport inside a container that had the whole thing.
    */
    <div data-testid="note-thread">
      {ancestors.length > 0 && (
        <div className="divide-y divide-lc-border border-b border-lc-border opacity-80">
          {ancestors.map((note) => (
            <NoteCard key={note.id} note={note} onOpenProfile={onOpenProfile} onOpenNote={onOpenNote} />
          ))}
        </div>
      )}

      <div className="border-b border-lc-border bg-lc-dark/40" data-testid="thread-focus">
        <NoteCard
          note={root}
          onOpenProfile={onOpenProfile}
        />
      </div>

      {/*
        The composer is here, not behind a toggle. You opened a thread: the
        two things you came for are reading the replies and adding one, and
        a button that reveals a box is a step in front of the second.
        `autoFocus` stays off — landing here should show you the
        conversation, not the keyboard.
      */}
      {myPubkey && (
        <div className="border-b border-lc-border p-3" data-testid="thread-reply-composer">
          <NoteComposer
            mode={{ kind: 'reply', parent: root }}
            onPublished={(event) => setReplies((current) => [...current, event])}
          />
        </div>
      )}

      {replies.length > 0 ? (
        <div className="divide-y divide-lc-border">
          {replies.map((note) => (
            <NoteCard key={note.id} note={note} onOpenProfile={onOpenProfile} onOpenNote={onOpenNote} />
          ))}
        </div>
      ) : (
        <p className="p-6 text-center text-xs text-lc-muted">{t('social.noReplies')}</p>
      )}
    </div>
  );
}
