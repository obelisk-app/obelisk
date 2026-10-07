import type { MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { useNotePreview } from '@/hooks/social/note/useNotePreview';
import type { ReplyParent } from '@/services/social/feed';
import { displayNameFor } from '@/utils/identity/display-name';

/**
 * The "Replying to" line's view model: who the parent's author is (from the
 * `e` tag when the publisher named them, else from the fetched parent), the
 * name to show, and the two links. Both links stop the click there, so the
 * card behind them doesn't also open its own thread.
 */
export function useReplyLine({
  parent,
  onOpenNote,
  onOpenProfile,
}: {
  parent: ReplyParent;
  onOpenNote?: (id: string) => void;
  onOpenProfile?: (pubkey: string) => void;
}) {
  const t = useTranslations();
  // Only fetch when the tag didn't name the author: that is the whole point
  // of reading the tag first.
  const fetched = useNotePreview(parent.author ? null : parent.id, parent.relay ? [parent.relay] : undefined);
  const authorPubkey = parent.author ?? fetched?.pubkey ?? null;
  const meta = useAuthor(authorPubkey);

  return {
    name: authorPubkey ? displayNameFor(authorPubkey, meta) : t('social.replyingToUnknown'),
    /** The author is a link only when there is one to open and somewhere to open it. */
    canOpenAuthor: !!authorPubkey && !!onOpenProfile,
    openAuthor: (event: MouseEvent) => {
      event.stopPropagation();
      if (authorPubkey) onOpenProfile?.(authorPubkey);
    },
    openParent: (event: MouseEvent) => {
      event.stopPropagation();
      onOpenNote?.(parent.id);
    },
  };
}
