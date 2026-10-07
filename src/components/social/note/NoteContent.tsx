'use client';

/**
 * Renders a social note's body, resolving NIP-27 `nostr:` references that the
 * chat renderer knows nothing about.
 *
 * `MessageContent` handles markdown, media, emoji and link previews, and we
 * keep it for those, but it has no concept of `nostr:npub…`, so a mention
 * from Primal/Amethyst/Damus used to render as 60 characters of raw bech32
 * mid-sentence. Here we split the content around those references, hand the
 * text runs to `MessageContent`, and render the references as real UI.
 */

import { linkifyHashtags } from '@/services/social/profile-feed';
import { useNoteContent } from '@/hooks/social/note/useNoteContent';
import MessageContent from '@/components/chat/message/MessageContent';
import NoteContentPart from './NoteContentPart';

export default function NoteContent({
  content,
  noteId,
  onOpenProfile,
  onOpenNote,
  onOpenTag,
}: {
  content: string;
  noteId?: string;
  onOpenProfile?: (pubkey: string) => void;
  onOpenNote?: (id: string) => void;
  /**
   * Handle a hashtag in-app instead of navigating to `/t/<tag>`.
   *
   * `linkifyHashtags` turns `#bitcoin` into a markdown link so the public
   * viewer pages have somewhere real to point, but inside the app, leaving
   * for a standalone page throws away the feed you were reading. Hosts that
   * have a tag surface of their own (the feed's search) pass this and the
   * link becomes an in-app action; hosts that don't leave it alone and the
   * anchor still works.
   */
  onOpenTag?: (tag: string) => void;
}) {
  const { tokens, plain, onClick } = useNoteContent({ content, onOpenTag });

  // Fast path: no references, so nothing to interleave.
  if (plain) {
    return (
      <div onClick={onClick} data-testid="note-content">
        <MessageContent content={linkifyHashtags(content)} messageId={noteId} wideMedia />
      </div>
    );
  }

  return (
    <div className="space-y-1" onClick={onClick} data-testid="note-content">
      {tokens.map((token, index) => (
        <NoteContentPart
          key={`${token.kind}${index}`}
          token={token}
          noteId={noteId}
          onOpenProfile={onOpenProfile}
          onOpenNote={onOpenNote}
        />
      ))}
    </div>
  );
}

