'use client';

import { useMemo, useState } from 'react';
import { displayNameFor } from '@/utils/identity/display-name';
import { useMyFollows, useMyPubkey } from '@/services/nostr-bridge';
import { useAuthor } from '@/hooks/social/useAuthor';
import { useTranslation } from '@/i18n/context';
import { replyParentOf } from '@/services/social/feed';
import { parseImeta } from '@/services/social/imeta';
import { renderModeFor } from '@/services/social/kinds';
import { sensitiveInfo } from '@/services/social/sensitive';
import NoteHeader from './NoteHeader';
import NoteBody from './NoteBody';
import NoteActionRow from './NoteActionRow';
import { useNoteEngagement } from '@/hooks/social/note-card/useNoteEngagement';
import { bodyClickHandler } from '@/utils/social/note-card';
import type { NoteCardProps } from '../NoteCard';

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
  const { t } = useTranslation();
  const meta = useAuthor(note.pubkey);
  const myPubkey = useMyPubkey();
  const follows = useMyFollows();
  const followSet = useMemo(() => new Set(follows), [follows]);
  const [revealed, setRevealed] = useState(false);

  const mode = renderModeFor(note.kind);
  const warning = useMemo(() => sensitiveInfo(note), [note]);
  const imeta = useMemo(() => parseImeta(note), [note]);
  const replyParent = useMemo(() => replyParentOf(note), [note]);

  const displayName = displayNameFor(note.pubkey, meta);
  const canInteract = !!myPubkey;
  const isMine = myPubkey === note.pubkey;
  // Set lookup: a follow list runs to thousands and this renders per card.
  const isFollowed = followSet.has(note.pubkey);
  const engagement = useNoteEngagement(note, canInteract);

  const hidden = warning.sensitive && !revealed;

  /**
   * The card opens its thread.
   *
   * A note in a feed is a fragment: the post it answers, the replies under
   * it, who reacted. All of that existed behind a ⋯ item and nothing else,
   * so the obvious gesture (tap the thing you want to read more of) did
   * nothing at all.
   *
   * `nested` is excluded because the repost wrapper around it owns the click
   * for the whole row; two handlers would fire on one tap.
   */
  const openThread = onOpenNote && !quoted && !nested
    ? bodyClickHandler(() => onOpenNote(note.id))
    : undefined;

  return (
    <article
      className={
        quoted
          ? 'rounded-xl border border-lc-border bg-lc-dark p-3'
          : nested
            ? ''
            : `note-card px-5 py-4${openThread ? ' note-card-open' : ''}`
      }
      onClick={openThread}
      data-testid="note-card"
      data-kind={note.kind}
    >
      <NoteHeader
        note={note}
        meta={meta}
        displayName={displayName}
        mode={mode}
        replyParent={replyParent}
        quoted={quoted}
        isFollowed={isFollowed}
        isMine={isMine}
        onOpenProfile={onOpenProfile}
        onOpenNote={onOpenNote}
      />

      {hidden ? (
        <button
          type="button"
          className="w-full rounded-xl border border-lc-border bg-lc-dark px-4 py-6 text-center text-xs text-lc-muted"
          onClick={() => setRevealed(true)}
          data-testid="note-content-warning"
        >
          {warning.reason
            ? `${t('social.sensitive')} · ${warning.reason}`
            : t('social.sensitive')}
        </button>
      ) : (
        <NoteBody
          note={note}
          mode={mode}
          imetaCount={imeta.size}
          onOpenProfile={onOpenProfile}
          onOpenNote={onOpenNote}
          onOpenArticle={onOpenArticle}
          onOpenTag={onOpenTag}
        />
      )}

      {!quoted && (
        <NoteActionRow
          note={note}
          canInteract={canInteract}
          engagement={engagement}
          onOpenNote={onOpenNote}
          onReply={onReply}
          onQuote={onQuote}
          onZap={onZap}
        />
      )}
    </article>
  );
}
