'use client';

/**
 * "Replying to <someone>" — and a way to go read them.
 *
 * A reply used to be marked with a bare "↩ Reply" chip: it said that the
 * note answered *something*, named neither who nor what, and led nowhere.
 * Half a conversation with the other half withheld.
 *
 * The author usually costs nothing to show — NIP-10 puts the parent's pubkey
 * in the `e` tag's fifth slot, so it is already in hand. When a publisher
 * omitted it, the parent is fetched once and shared through
 * `useNotePreview`, and until it arrives the line still renders with a
 * neutral label rather than popping into existence a second later.
 */

import { displayNameFor } from '@/lib/display-name';
import { useAuthor } from '@/lib/social/useAuthor';
import { useNotePreview } from '@/lib/social/useNotePreview';
import { useTranslation } from '@/i18n/context';
import type { ReplyParent } from '@/lib/social/feed';

export default function ReplyLine({
  parent,
  onOpenNote,
  onOpenProfile,
}: {
  parent: ReplyParent;
  onOpenNote?: (id: string) => void;
  onOpenProfile?: (pubkey: string) => void;
}) {
  const { t } = useTranslation();
  // Only fetch when the tag didn't name the author — that is the whole point
  // of reading the tag first.
  const fetched = useNotePreview(parent.author ? null : parent.id, parent.relay ? [parent.relay] : undefined);
  const authorPubkey = parent.author ?? fetched?.pubkey ?? null;
  const meta = useAuthor(authorPubkey);

  const name = authorPubkey
    ? displayNameFor(authorPubkey, meta)
    : t('social.replyingToUnknown');

  return (
    <span className="flex min-w-0 items-center gap-1 text-[11px] text-lc-muted">
      <span aria-hidden="true">↩</span>
      <span className="shrink-0">{t('social.replyingTo')}</span>
      {authorPubkey && onOpenProfile ? (
        <button
          type="button"
          className="min-w-0 truncate font-medium text-lc-green hover:underline"
          onClick={(event) => { event.stopPropagation(); onOpenProfile(authorPubkey); }}
          data-testid="reply-line-author"
        >
          {name}
        </button>
      ) : (
        <span className="min-w-0 truncate font-medium text-lc-white/80" data-testid="reply-line-author">
          {name}
        </span>
      )}
      {/*
        The thing the reader actually wants: the note being answered. Kept as
        a separate control from the author — "who is this person" and "what
        did they say" are different questions.
      */}
      {onOpenNote && (
        <button
          type="button"
          className="shrink-0 text-lc-muted underline decoration-dotted underline-offset-2 hover:text-lc-white"
          onClick={(event) => { event.stopPropagation(); onOpenNote(parent.id); }}
          title={t('social.openParent')}
          data-testid="reply-line-open-parent"
        >
          {/*
            Not `social.reply`: beside "Replying to Alice" a control simply
            labelled "Reply" reads as the compose action repeated, and the
            row came out as "Replying to Alice · Reply · 50m".
          */}
          {t('social.openParentShort')}
        </button>
      )}
    </span>
  );
}
