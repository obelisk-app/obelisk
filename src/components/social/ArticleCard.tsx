'use client';

/**
 * NIP-23 long-form articles (kind 30023).
 *
 * These are addressable events whose `content` is markdown and whose
 * metadata lives in tags — `title`, `summary`, `image`, `published_at`. The
 * feed previously rendered them through the plain-note path, which meant a
 * 6000-word essay arrived as raw markdown in a note bubble: headings as
 * literal `##`, the whole thing unclipped.
 *
 * Two surfaces here: a compact card for the feed, and a reader for when it's
 * opened. Both read the same tag helpers so they can't disagree about which
 * title an article has.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useAuthor } from '@/lib/social/useAuthor';
import { useTranslation } from '@/i18n/context';
import { usePreferences } from '@/lib/preferences';
import { fetchArticleHighlights, highlightRuns } from '@/lib/social/highlights';
import { markHighlights } from '@/lib/social/mark-highlights';
import UserAvatar from '@/components/UserAvatar';
import MessageContent from '@/components/chat/MessageContent';

export type ArticleMeta = {
  title: string | null;
  summary: string | null;
  image: string | null;
  publishedAt: number | null;
  identifier: string | null;
  hashtags: string[];
};

export function articleMeta(note: Pick<NostrEvent, 'tags' | 'created_at'>): ArticleMeta {
  const tag = (name: string) => note.tags.find((t) => t[0] === name)?.[1] || null;
  const published = tag('published_at');
  const parsed = published ? Number.parseInt(published, 10) : Number.NaN;
  return {
    title: tag('title'),
    summary: tag('summary'),
    image: tag('image'),
    // `published_at` is the author's stated publication time and can differ
    // from `created_at`, which changes on every edit of a replaceable event.
    publishedAt: Number.isFinite(parsed) ? parsed : note.created_at,
    identifier: tag('d'),
    hashtags: note.tags.filter((t) => t[0] === 't' && t[1]).map((t) => t[1]),
  };
}

/** Rough reading time, the way every article surface shows it. */
export function readingMinutes(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

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
      // desktop column was taller than the viewport — you scrolled past a
      // poster to reach the next note. The thumbnail is a fixed 13rem, so
      // the card's height stops depending on the column's width.
      className="group flex w-full flex-col overflow-hidden rounded-2xl border border-lc-border bg-lc-dark text-left transition-colors hover:border-lc-green/40 sm:flex-row"
      data-testid="note-article"
    >
      {meta.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={meta.image}
          alt=""
          loading="lazy"
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
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-lc-green">
          <span>{t('social.article')}</span>
          <span aria-hidden="true">·</span>
          <span className="normal-case tracking-normal text-lc-muted">
            {minutes} {t('social.minRead')}
          </span>
        </div>
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

/** Full reader — used by the thread pane and the article modal. */
export default function ArticleReader({
  note,
  onOpenProfile,
}: {
  note: NostrEvent;
  onOpenProfile?: (pubkey: string) => void;
}) {
  const { t } = useTranslation();
  const author = useAuthor(note.pubkey);
  const meta = useMemo(() => articleMeta(note), [note]);
  const minutes = useMemo(() => readingMinutes(note.content), [note.content]);
  const name = author?.displayName || author?.name || note.pubkey.slice(0, 10);
  const relays = usePreferences().socialRelays;

  // Off by default and fetched on demand: nobody pays for highlights unless
  // they ask, and a feed of 50 articles would otherwise issue 50 queries.
  const [showHighlights, setShowHighlights] = useState(false);
  // Keyed by note id rather than reset in an effect: an effect that clears
  // state on prop change renders once with the previous article's data.
  const [fetched, setFetched] = useState<{ noteId: string; events: NostrEvent[] } | null>(null);
  const highlights = fetched?.noteId === note.id ? fetched.events : null;
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showHighlights || highlights !== null) return;
    let cancelled = false;
    fetchArticleHighlights(note, { relays })
      .then((result) => { if (!cancelled) setFetched({ noteId: note.id, events: result }); })
      .catch(() => { if (!cancelled) setFetched({ noteId: note.id, events: [] }); });
    return () => { cancelled = true; };
  }, [showHighlights, highlights, note, relays]);

  const runs = useMemo(
    () => (showHighlights && highlights ? highlightRuns(highlights) : []),
    [showHighlights, highlights],
  );

  useEffect(() => {
    const body = bodyRef.current;
    if (!body || runs.length === 0) return;
    // Marking returns its own undo, so toggling off restores the DOM rather
    // than re-rendering content that hasn't changed.
    return markHighlights(body, runs);
  }, [runs, note.id]);

  return (
    <article className="mx-auto w-full max-w-2xl px-5 py-6" data-testid="article-reader">
      {meta.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={meta.image}
          alt=""
          loading="lazy"
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
          {meta.publishedAt ? formatDate(meta.publishedAt) : null}
          {' · '}
          {minutes} {t('social.minRead')}
        </span>
        {/*
          Highlights belong here rather than in the feed: as feed rows they
          read as strangers posting paragraphs they didn't write, and a
          popular article produces dozens of overlapping ones.
        */}
        <button
          type="button"
          onClick={() => setShowHighlights((value) => !value)}
          aria-pressed={showHighlights}
          className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
            showHighlights
              ? 'border-lc-green/50 bg-lc-green/15 text-lc-green'
              : 'border-lc-border text-lc-muted hover:text-lc-white'
          }`}
          data-testid="article-highlights-toggle"
        >
          {t('social.highlights')}
          {showHighlights && highlights !== null && ` · ${runs.length}`}
        </button>
      </div>

      {/*
        `prose-*` utilities aren't available here, so the typography comes
        from `.article-body` in globals.css — headings, lists, quotes and
        code sized for reading rather than for a chat bubble.
      */}
      <div ref={bodyRef} className="article-body note-media mt-6 text-[15px] leading-7 text-lc-white">
        <MessageContent content={note.content} messageId={note.id} wideMedia />
      </div>

      {meta.hashtags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-1.5 border-t border-lc-border pt-4">
          {meta.hashtags.map((tag) => (
            <span key={tag} className="rounded-full bg-lc-dark px-2.5 py-1 text-[11px] text-lc-muted">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
