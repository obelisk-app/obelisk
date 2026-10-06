'use client';

/**
 * A note with its context: the parent chain above it and the replies below.
 *
 * The old "Replies" tab showed a user's replies with no sign of what they
 * were replying to, which made half the feed unreadable. `fetchThread` from
 * the SDK does the heavy query; `fetchNote` walks the parent chain.
 */

import { useTranslation } from '@/i18n/context';
import { useNoteThread } from '@/hooks/social/useNoteThread';
import NoteCard from './NoteCard';
import NoteComposer from './NoteComposer';
import { useMyPubkey } from '@/services/nostr-bridge';
import EmptyState from '@/components/ui/EmptyState';

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
  const { root, ancestors, replies, loading, error, addReply } = useNoteThread(noteId);

  if (loading) {
    return (
      <div className="space-y-3 p-4" data-testid="thread-loading">
        {[0, 1].map((item) => <div key={item} className="lc-skeleton h-24 rounded-xl" />)}
      </div>
    );
  }

  if (error || !root) {
    return (
      <EmptyState as="p" padding="none" className="p-6" data-testid="thread-error">
        {t('social.noteNotFound')}
      </EmptyState>
    );
  }

  return (
    /*
      No `max-h`/`overflow` of its own any more: every host that renders a
      thread (the inline reader, the desktop pane, the phone screen)
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
        `autoFocus` stays off: landing here should show you the
        conversation, not the keyboard.
      */}
      {myPubkey && (
        <div className="border-b border-lc-border p-3" data-testid="thread-reply-composer">
          <NoteComposer
            mode={{ kind: 'reply', parent: root }}
            onPublished={addReply}
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
