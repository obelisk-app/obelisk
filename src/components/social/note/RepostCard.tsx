'use client';

/**
 * A kind 6 / kind 16 row: "Alice, Bob and 6 others reposted" over the note
 * they reposted.
 *
 * The embedded note is only rendered after `embeddedRepostEvent` has checked
 * its signature and its id against the wrapper's `e` tag. Anything else
 * (an empty repost, or a forged blob) gets a button that opens the real
 * note by id instead.
 */

import { useTranslations } from 'next-intl';
import { useRepostCard } from '@/hooks/social/note/useRepostCard';
import PlainNoteCard from './PlainNoteCard';
import NoteIcon from './NoteIcon';
import RepostersLine from './RepostersLine';
import type { NoteCardProps } from '../../../utils/social/note-card';

export default function RepostCard(props: NoteCardProps) {
  const t = useTranslations();
  const { inner, everyone, openReposted, openTarget } = useRepostCard(props);

  return (
    <article
      className={`note-card px-5 py-4${openReposted ? ' note-card-open' : ''}`}
      onClick={openReposted}
      data-testid="repost-card"
    >
      {/*
        The attribution was 11px muted text with a `⇄` glyph: small enough to
        miss, and the glyph rendered at a different weight than the SVG icons
        beside it. It's the first thing you need to understand the row, so it
        reads as a line of text now, with the names emphasised.
      */}
      <div
        className="mb-2 flex items-center gap-2 text-[13px] text-lc-muted"
        data-testid="repost-attribution"
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-lc-green">
          <NoteIcon name="repost" />
        </span>
        <span className="min-w-0 truncate">
          <RepostersLine pubkeys={everyone} onOpenProfile={props.onOpenProfile} />
          {' '}
          {t('social.reposted')}
        </span>
      </div>
      {inner ? (
        // `nested` (not `quoted`): the original keeps its full action row, so
        // replying or liking from a repost targets the note that was
        // reposted, which is what the reader means by those buttons.
        <PlainNoteCard {...props} note={inner} nested />
      ) : (
        // Empty-content repost, or an embed that failed verification: the
        // target has to be fetched. Rather than block the row, link out to
        // what we know; the thread view fetches by id through the pool,
        // which verifies it.
        <button
          type="button"
          className="w-full rounded-xl border border-lc-border bg-lc-dark p-3 text-left text-xs text-lc-muted"
          onClick={openTarget}
        >
          {t('social.openRepostedNote')}
        </button>
      )}
    </article>
  );
}
