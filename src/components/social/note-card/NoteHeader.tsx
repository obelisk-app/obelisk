'use client';

import type { ReactNode } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import type { AuthorIdentity } from '@/hooks/social/useAuthor';
import { useTranslation } from '@/i18n/context';
import type { renderModeFor } from '@/services/social/kinds';
import type { replyParentOf } from '@/services/social/feed';
import UserAvatar from '@/components/ui/UserAvatar';
import ReplyLine from '../ReplyLine';
import NoteMenu from '../NoteMenu';
import { relativeTime } from '@/utils/format/relative-time';
import TextButton from '@/components/ui/TextButton';

/** Avatar, name, following badge, reply line, timestamp and the ⋯ menu. */
export default function NoteHeader({
  note,
  meta,
  displayName,
  mode,
  replyParent,
  quoted,
  isFollowed,
  isMine,
  onOpenProfile,
  onOpenNote,
}: {
  note: NostrEvent;
  meta: AuthorIdentity;
  displayName: string;
  mode: ReturnType<typeof renderModeFor>;
  replyParent: ReturnType<typeof replyParentOf>;
  quoted: boolean;
  isFollowed: boolean;
  isMine: boolean;
  onOpenProfile?: (pubkey: string) => void;
  onOpenNote?: (id: string) => void;
}) {
  const { t, locale } = useTranslation();

  /**
   * The second header row only earns its space when it has something to say:
   * who this answers, or what kind of thing it is. Otherwise the
   * timestamp joins the name row rather than sitting alone under it.
   */
  const hasMetaRow = !!replyParent || mode === 'article' || mode === 'highlight';

  const time = (
    <time dateTime={new Date(note.created_at * 1000).toISOString()}>
      {relativeTime(note.created_at, t, locale, 'social.now')}
    </time>
  );

  // Also the accessible route into the thread, and the only one a `nested`
  // card has: its body click belongs to the repost wrapper, but a keyboard
  // still needs a real control to land on.
  const timestamp: ReactNode = onOpenNote && !quoted ? (
    <TextButton tone="plain" className="hover:text-lc-white"
      onClick={() => onOpenNote(note.id)}
      title={t('social.openThread')}
      data-testid="note-open-thread"
    >
      {time}
    </TextButton>
  ) : time;

  return (
    <header className="mb-2 flex items-start gap-3">
      <button type="button" className="shrink-0" onClick={() => onOpenProfile?.(note.pubkey)} aria-label={displayName}>
        <UserAvatar
          pubkey={note.pubkey}
          picture={meta.picture}
          size={quoted ? 8 : 10}
          name={displayName}
          alt={displayName}
        />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <TextButton tone="plain" className="min-w-0 truncate text-[15px] font-semibold text-lc-white"
            onClick={() => onOpenProfile?.(note.pubkey)}
          >
            {displayName}
          </TextButton>
          {/*
            In the Global feed every author looks the same as someone you
            follow, so there's no way to tell whose voice you chose and
            whose the relay handed you. The badge is deliberately quiet:
            it marks the familiar rather than shouting about strangers.
          */}
          {!quoted && isFollowed && !isMine && (
            <span
              className="shrink-0 rounded-full bg-lc-green/15 px-1.5 py-0.5 text-[10px] font-semibold text-lc-green"
              data-testid="note-following-badge"
            >
              {t('social.followingBadge')}
            </span>
          )}
          {/*
            On a note with nothing else to say about itself, the timestamp
            rides the name row. It used to sit alone on a second line,
            leaving an empty indented band under every non-reply: a whole
            wasted row per card, which on a phone is most of the feed.
          */}
          {!hasMetaRow && (
            <span className="ml-auto shrink-0 pl-1 text-[11px] text-lc-muted">{timestamp}</span>
          )}
        </div>
        {hasMetaRow && (
          <div className="flex items-center gap-2 text-[11px] text-lc-muted">
            {/* Names who is being answered and links to them: a reply
                that only says "reply" is half a conversation. */}
            {replyParent && (
              <ReplyLine
                parent={replyParent}
                onOpenNote={onOpenNote}
                onOpenProfile={onOpenProfile}
              />
            )}
            {mode === 'article' && <span>{t('social.article')}</span>}
            {mode === 'highlight' && <span>{t('social.highlight')}</span>}
            {timestamp}
          </div>
        )}
      </div>
      {/*
        Top-right, where every client puts it and where it can't be
        confused with the interaction row: down there it was a sixth
        action competing with reply and zap for the same thumb.
      */}
      {!quoted && <NoteMenu note={note} isMine={isMine} />}
    </header>
  );
}
