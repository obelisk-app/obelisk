'use client';

import type { Event as NostrEvent } from 'nostr-tools';
import ArticleReader from '@/components/social/article/ArticleCard';
import NoteThread from '@/components/social/note/NoteThread';

/**
 * What the reader pane shows: the article, or the thread at the top of the
 * stack. One body for both the fullscreen and the side-by-side variant.
 */
export function ReaderPaneContent({
  article,
  threadNoteId,
  onOpenProfile,
  onOpenNote,
}: {
  article: NostrEvent | null;
  threadNoteId: string | null;
  onOpenProfile: (pubkey: string) => void;
  /** Follow a note from inside the thread, keeping the way back. */
  onOpenNote: (id: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid={article ? 'desktop-article-pane' : 'desktop-thread-body'}>
      {article ? (
        <ArticleReader note={article} onOpenProfile={onOpenProfile} />
      ) : threadNoteId ? (
        <NoteThread noteId={threadNoteId} onOpenProfile={onOpenProfile} onOpenNote={onOpenNote} />
      ) : null}
    </div>
  );
}
