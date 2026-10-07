'use client';

import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslations } from 'next-intl';
import type { NoteEngagement } from '@/hooks/social/note/useNoteEngagement';
import { useNoteActionRow } from '@/hooks/social/note/useNoteActionRow';
import ActionButton from './ActionButton';
import RepostButton from './RepostButton';
import { BoltIcon, HeartIcon, MessageCircleIcon, ShareUpIcon } from '@/assets/icons';

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
  const t = useTranslations();
  const { counts, busy, reacted, reposted } = engagement;
  const act = useNoteActionRow({ note, engagement, onOpenNote, onReply, onQuote, onZap });

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
        icon={<MessageCircleIcon size={18} strokeWidth={1.75} />}
        count={counts.replyCount}
        testId="note-reply"
        disabled={!canInteract && !onOpenNote}
        onClick={act.reply}
      />
      <RepostButton
        count={counts.repostCount}
        active={reposted}
        disabled={!canInteract || busy}
        onRepost={act.repost}
        onQuote={act.quote}
      />
      <ActionButton
        kind="like"
        label={t('social.react')}
        icon={<HeartIcon size={18} strokeWidth={1.75} fill={reacted ? 'currentColor' : 'none'} />}
        count={counts.reactionCount}
        testId="note-react"
        active={reacted}
        disabled={!canInteract || busy || reacted}
        onClick={act.react}
      />
      <ActionButton
        kind="zap"
        label={t('social.zap')}
        icon={<BoltIcon size={18} strokeWidth={1.75} fill={counts.zapTotalSats > 0 ? 'currentColor' : 'none'} />}
        count={counts.zapTotalSats}
        testId="note-zap"
        disabled={!canInteract}
        onClick={act.zap}
      />
      {/*
        Sharing was buried in the ⋯ menu, two taps deep, even though it's
        the thing a public note is for.
      */}
      <ActionButton
        kind="share"
        label={t('social.share')}
        icon={<ShareUpIcon size={18} strokeWidth={1.75} />}
        testId="note-share"
        onClick={act.share}
      />
    </div>
  );
}
