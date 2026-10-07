import { useMemo, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useMyFollows, useMyPubkey } from '@/services/nostr-bridge';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { useNoteEngagement } from '@/hooks/social/note/useNoteEngagement';
import { replyParentOf } from '@/services/social/feed';
import { parseImeta } from '@/services/social/imeta';
import { renderModeFor } from '@/services/social/kinds';
import { sensitiveInfo } from '@/services/social/sensitive';
import { displayNameFor } from '@/utils/identity/display-name';
import { bodyClickHandler } from '@/utils/social/note-card';

/**
 * A plain note card's view model: the author, how the note renders, its
 * content warning, the reply it answers, the reader's relation to it and
 * the live engagement counts, each derived once per note.
 */
export function usePlainNoteCard({
  note,
  quoted,
  nested,
  onOpenNote,
}: {
  note: NostrEvent;
  quoted: boolean;
  nested: boolean;
  onOpenNote?: (id: string) => void;
}) {
  const meta = useAuthor(note.pubkey);
  const myPubkey = useMyPubkey();
  const follows = useMyFollows();
  // Set lookup: a follow list runs to thousands and this renders per card.
  const followSet = useMemo(() => new Set(follows), [follows]);
  const [revealed, setRevealed] = useState(false);

  const warning = useMemo(() => sensitiveInfo(note), [note]);
  const imeta = useMemo(() => parseImeta(note), [note]);
  const replyParent = useMemo(() => replyParentOf(note), [note]);
  const canInteract = !!myPubkey;
  const engagement = useNoteEngagement(note, canInteract);

  return {
    meta,
    displayName: displayNameFor(note.pubkey, meta),
    mode: renderModeFor(note.kind),
    warning,
    hidden: warning.sensitive && !revealed,
    reveal: () => setRevealed(true),
    imetaCount: imeta.size,
    replyParent,
    canInteract,
    isMine: myPubkey === note.pubkey,
    isFollowed: followSet.has(note.pubkey),
    engagement,
    /**
     * The card opens its thread.
     *
     * A note in a feed is a fragment: the post it answers, the replies under
     * it, who reacted. All of that existed behind a ⋯ item and nothing else,
     * so the obvious gesture (tap the thing you want to read more of) did
     * nothing at all.
     *
     * `nested` is excluded because the repost wrapper around it owns the
     * click for the whole row; two handlers would fire on one tap.
     */
    openThread: onOpenNote && !quoted && !nested
      ? bodyClickHandler(() => onOpenNote(note.id))
      : undefined,
  };
}
