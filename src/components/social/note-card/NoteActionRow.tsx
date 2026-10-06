'use client';

import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslation } from '@/i18n/context';
import {
  ActionButton,
  LikeIcon,
  RepostButton,
  ReplyIcon,
  ShareIcon,
  ZapIcon,
} from '../NoteActions';
import type { NoteEngagement } from './useNoteEngagement';

/**
 * Reply, repost, like, zap, share: the row under a full card.
 *
 * `justify-between` rather than a left-packed row: on a phone the five
 * actions used a third of the card and left a dead zone the width of a
 * thumb. Spread, each one gets its own column and the targets stop
 * crowding each other.
 */
export default function NoteActionRow({
  note,
  canInteract,
  engagement,
  onOpenNote,
  onReply,
  onQuote,
  onZap,
}: {
  note: NostrEvent;
  canInteract: boolean;
  /** Owned by the card, so a quoted card keeps its count subscription too. */
  engagement: NoteEngagement;
  onOpenNote?: (id: string) => void;
  onReply?: (note: NostrEvent) => void;
  onQuote?: (note: NostrEvent) => void;
  onZap?: (note: NostrEvent) => void;
}) {
  const { t } = useTranslation();
  const { counts, busy, reacted, reposted, share, react, repost } = engagement;

  return (
    <div className="mt-2 flex items-center justify-between gap-1 pt-1 text-xs sm:justify-start">
      {/*
        Opens the conversation rather than a composer. The count says
        how many replies there are: tapping it and getting a blank
        compose box answers a question nobody asked. The thread has its
        own reply box, right at the top.
      */}
      <ActionButton
        kind="reply"
        label={t('social.replyAction')}
        icon={<ReplyIcon />}
        count={counts.replyCount}
        testId="note-reply"
        disabled={!canInteract && !onOpenNote}
        onClick={() => (onOpenNote ? onOpenNote(note.id) : onReply?.(note))}
      />
      <RepostButton
        count={counts.repostCount}
        active={reposted}
        disabled={!canInteract || busy}
        onRepost={() => void repost()}
        onQuote={onQuote ? () => onQuote(note) : undefined}
      />
      <ActionButton
        kind="like"
        label={t('social.react')}
        icon={<LikeIcon filled={reacted} />}
        count={counts.reactionCount}
        testId="note-react"
        active={reacted}
        disabled={!canInteract || busy || reacted}
        onClick={() => void react()}
      />
      <ActionButton
        kind="zap"
        label={t('social.zap')}
        icon={<ZapIcon filled={counts.zapTotalSats > 0} />}
        count={counts.zapTotalSats}
        testId="note-zap"
        disabled={!canInteract}
        onClick={() => onZap?.(note)}
      />
      {/*
        Sharing was buried in the ⋯ menu, two taps deep, even though it's
        the thing a public note is for.
      */}
      <ActionButton
        kind="share"
        label={t('social.share')}
        icon={<ShareIcon />}
        testId="note-share"
        onClick={() => void share()}
      />
    </div>
  );
}
