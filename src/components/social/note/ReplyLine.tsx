'use client';

/**
 * "Replying to <someone>", and a way to go read them.
 *
 * A reply used to be marked with a bare "↩ Reply" chip: it said that the
 * note answered *something*, named neither who nor what, and led nowhere.
 * Half a conversation with the other half withheld.
 *
 * The author usually costs nothing to show: NIP-10 puts the parent's pubkey
 * in the `e` tag's fifth slot, so it is already in hand. When a publisher
 * omitted it, the parent is fetched once and shared through
 * `useNotePreview`, and until it arrives the line still renders with a
 * neutral label rather than popping into existence a second later.
 */

import { useTranslations } from 'next-intl';
import { useReplyLine } from '@/hooks/social/note/useReplyLine';
import type { ReplyParent } from '@/services/social/feed';
import TextButton from '@/components/ui/buttons/TextButton';

export default function ReplyLine({
  parent,
  onOpenNote,
  onOpenProfile,
}: {
  parent: ReplyParent;
  onOpenNote?: (id: string) => void;
  onOpenProfile?: (pubkey: string) => void;
}) {
  const t = useTranslations();
  const vm = useReplyLine({ parent, onOpenNote, onOpenProfile });

  return (
    <span className="flex min-w-0 items-center gap-1 text-[11px] text-lc-muted">
      <span aria-hidden="true">↩</span>
      <span className="shrink-0">{t('social.replyingTo')}</span>
      {vm.canOpenAuthor ? (
        <TextButton className="min-w-0 truncate font-medium"
          onClick={vm.openAuthor}
          data-testid="reply-line-author"
        >
          {vm.name}
        </TextButton>
      ) : (
        <span className="min-w-0 truncate font-medium text-lc-white/80" data-testid="reply-line-author">
          {vm.name}
        </span>
      )}
      {/*
        The thing the reader actually wants: the note being answered. Kept as
        a separate control from the author: "who is this person" and "what
        did they say" are different questions.
      */}
      {onOpenNote && (
        <TextButton tone="muted" className="shrink-0 decoration-dotted"
          onClick={vm.openParent}
          title={t('social.openParent')}
          data-testid="reply-line-open-parent"
        >
          {/*
            Not `social.reply`: beside "Replying to Alice" a control simply
            labelled "Reply" reads as the compose action repeated, and the
            row came out as "Replying to Alice · Reply · 50m".
          */}
          {t('social.openParentShort')}
        </TextButton>
      )}
    </span>
  );
}
