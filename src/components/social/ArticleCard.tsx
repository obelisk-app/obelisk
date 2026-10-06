'use client';

/**
 * NIP-23 long-form articles (kind 30023).
 *
 * These are addressable events whose `content` is markdown and whose
 * metadata lives in tags: `title`, `summary`, `image`, `published_at`. The
 * feed previously rendered them through the plain-note path, which meant a
 * 6000-word essay arrived as raw markdown in a note bubble: headings as
 * literal `##`, the whole thing unclipped.
 *
 * Two surfaces here: a compact card for the feed, and a reader for when it's
 * opened. Both read the same tag helpers so they can't disagree about which
 * title an article has.
 */

import { useMemo } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useAuthor } from '@/services/social/useAuthor';
import { useTranslation } from '@/i18n/context';
import Badge from '@/components/ui/Badge';
import Chip from '@/components/ui/Chip';
import RemoteImage from '@/components/ui/RemoteImage';
import Text from '@/components/ui/Text';
import UserAvatar from '@/components/ui/UserAvatar';
import MessageContent from '@/components/chat/MessageContent';
import { articleDate, articleMeta, readingMinutes } from './article-meta';
import { useArticleHighlights } from './useArticleHighlights';
export { articleMeta, readingMinutes, type ArticleMeta } from './article-meta';

/** Compact card for a feed row. */
export function ArticleCard({
  note,
  onOpen,
}: {
  note: NostrEvent;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const meta = useMemo(() => articleMeta(note), [note]);
  const minutes = useMemo(() => readingMinutes(note.content), [note.content]);

  return (
    <button
      type="button"
      onClick={onOpen}
      // Side-by-side above `sm`. Stacked with a 2:1 banner, one article on a
      // desktop column was taller than the viewport: you scrolled past a
      // poster to reach the next note. The thumbnail is a fixed 13rem, so
      // the card's height stops depending on the column's width.
      className="group flex w-full flex-col overflow-hidden rounded-2xl border border-lc-border bg-lc-dark text-left transition-colors hover:border-lc-green/40 sm:flex-row"
      data-testid="note-article"
    >
      {meta.image ? (
        <RemoteImage
          src={meta.image}
          alt=""
          decoding="async"
          className="aspect-[2/1] w-full shrink-0 bg-lc-black object-cover sm:aspect-auto sm:h-auto sm:w-52 sm:self-stretch"
        />
      ) : (
        // Without a banner the card had no visual weight at all and read as
        // a slightly indented note.
        <div className="flex aspect-[4/1] w-full shrink-0 items-center justify-center bg-gradient-to-br from-lc-olive/40 to-lc-black sm:aspect-auto sm:w-20 sm:self-stretch">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-lc-green/60" aria-hidden="true">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1.5 p-3.5">
        <Text as="div" size="11" variant="label" tone="accent" className="flex items-center gap-2">
          <span>{t('social.article')}</span>
          <span aria-hidden="true">·</span>
          <span className="normal-case tracking-normal text-lc-muted">
            {minutes} {t('social.minRead')}
          </span>
        </Text>
        <h3 className="line-clamp-2 text-base font-bold leading-snug text-lc-white">
          {meta.title || t('social.untitledArticle')}
        </h3>
        {(meta.summary || note.content) && (
          <p className="line-clamp-2 text-[13px] leading-relaxed text-lc-muted">
            {meta.summary || note.content.replace(/[#*_`>[\]()!]/g, '').slice(0, 220)}
          </p>
        )}
        <span className="inline-block pt-1 text-[11px] font-semibold text-lc-green">
          {t('social.openArticle')} →
        </span>
        {meta.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {meta.hashtags.slice(0, 4).map((tag) => (
              <span key={tag} className="rounded-full bg-lc-black px-2 py-0.5 text-[11px] text-lc-muted">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

/** Full reader: used by the thread pane and the article modal. */
export default function ArticleReader({
  note,
  onOpenProfile,
}: {
  note: NostrEvent;
  onOpenProfile?: (pubkey: string) => void;
}) {
  const { t, locale } = useTranslation();
  const author = useAuthor(note.pubkey);
  const meta = useMemo(() => articleMeta(note), [note]);
  const minutes = useMemo(() => readingMinutes(note.content), [note.content]);
  const name = author?.displayName || author?.name || note.pubkey.slice(0, 10);
  const { showHighlights, setShowHighlights, highlights, runs, bodyRef } = useArticleHighlights(note);

  return (
    <article className="mx-auto w-full max-w-2xl px-5 py-6" data-testid="article-reader">
      {meta.image && (
        <RemoteImage
          src={meta.image}
          alt=""
          decoding="async"
          className="mb-6 max-h-72 w-full rounded-2xl object-cover"
        />
      )}

      <h1 className="text-balance text-2xl font-extrabold leading-tight text-lc-white md:text-3xl">
        {meta.title || t('social.untitledArticle')}
      </h1>

      {meta.summary && (
        <p className="mt-3 text-sm leading-relaxed text-lc-muted">{meta.summary}</p>
      )}

      <div className="mt-5 flex items-center gap-3 border-y border-lc-border py-3">
        <button
          type="button"
          onClick={() => onOpenProfile?.(note.pubkey)}
          className="flex items-center gap-2 text-left"
        >
          <UserAvatar pubkey={note.pubkey} picture={author?.picture} size={9} name={name} alt="" />
          <span className="text-sm font-medium text-lc-white hover:underline">{name}</span>
        </button>
        <span className="ml-auto text-[11px] text-lc-muted">
          {meta.publishedAt ? articleDate(locale, meta.publishedAt) : null}
          {' · '}
          {minutes} {t('social.minRead')}
        </span>
        {/*
          Highlights belong here rather than in the feed: as feed rows they
          read as strangers posting paragraphs they didn't write, and a
          popular article produces dozens of overlapping ones.
        */}
        <Chip
          size="11"
          onClick={() => setShowHighlights((value) => !value)}
          state={showHighlights ? 'selected' : 'idle'}
          className="shrink-0 font-medium"
          data-testid="article-highlights-toggle"
        >
          {t('social.highlights')}
          {showHighlights && highlights !== null && ` · ${runs.length}`}
        </Chip>
      </div>

      {/*
        `prose-*` utilities aren't available here, so the typography comes
        from `.article-body` in globals.css: headings, lists, quotes and
        code sized for reading rather than for a chat bubble.
      */}
      <div ref={bodyRef} className="article-body note-media mt-6 text-[15px] leading-7 text-lc-white">
        <MessageContent content={note.content} messageId={note.id} wideMedia />
      </div>

      {meta.hashtags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-1.5 border-t border-lc-border pt-4">
          {meta.hashtags.map((tag) => (
            <Badge key={tag} tone="muted">
              #{tag}
            </Badge>
          ))}
        </div>
      )}
    </article>
  );
}
