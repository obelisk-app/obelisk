'use client';

import { useTranslations } from 'next-intl';
import { usePlainNoteCard } from '@/hooks/social/note/usePlainNoteCard';
import NoteHeader from './NoteHeader';
import NoteBody from './NoteBody';
import NoteActionRow from './NoteActionRow';
import type { NoteCardProps } from '../../../utils/social/note-card';

/** A note that is not a repost wrapper: header, body (or content warning), actions. */
export default function PlainNoteCard({
  note,
  onOpenProfile,
  onOpenNote,
  onReply,
  onQuote,
  onZap,
  onOpenArticle,
  onOpenTag,
  variant = 'full',
  nested = false,
}: NoteCardProps) {
  const quoted = variant === 'quoted';
  const t = useTranslations();
  const vm = usePlainNoteCard({ note, quoted, nested, onOpenNote });

  return (
    <article
      className={
        quoted
          ? 'rounded-xl border border-lc-border bg-lc-dark p-3'
          : nested
            ? ''
            : `note-card px-5 py-4${vm.openThread ? ' note-card-open' : ''}`
      }
      onClick={vm.openThread}
      data-testid="note-card"
      data-kind={note.kind}
    >
      <NoteHeader
        note={note}
        meta={vm.meta}
        displayName={vm.displayName}
        mode={vm.mode}
        replyParent={vm.replyParent}
        quoted={quoted}
        isFollowed={vm.isFollowed}
        isMine={vm.isMine}
        onOpenProfile={onOpenProfile}
        onOpenNote={onOpenNote}
      />

      {vm.hidden ? (
        <button
          type="button"
          className="w-full rounded-xl border border-lc-border bg-lc-dark px-4 py-6 text-center text-xs text-lc-muted"
          onClick={vm.reveal}
          data-testid="note-content-warning"
        >
          {vm.warning.reason
            ? `${t('social.sensitive')} · ${vm.warning.reason}`
            : t('social.sensitive')}
        </button>
      ) : (
        <NoteBody
          note={note}
          mode={vm.mode}
          imetaCount={vm.imetaCount}
          onOpenProfile={onOpenProfile}
          onOpenNote={onOpenNote}
          onOpenArticle={onOpenArticle}
          onOpenTag={onOpenTag}
        />
      )}

      {!quoted && (
        <NoteActionRow
          note={note}
          canInteract={vm.canInteract}
          engagement={vm.engagement}
          onOpenNote={onOpenNote}
          onReply={onReply}
          onQuote={onQuote}
          onZap={onZap}
        />
      )}
    </article>
  );
}
