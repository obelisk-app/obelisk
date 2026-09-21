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

import { useMemo } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useAuthor } from '@/lib/social/useAuthor';
import { useTranslation } from '@/i18n/context';
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
      className="group block w-full overflow-hidden rounded-2xl border border-lc-border bg-lc-dark text-left transition-colors hover:border-lc-green/40"
      data-testid="note-article"
    >
      {meta.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={meta.image}
          alt=""
          loading="lazy"
          decoding="async"
          // A fixed aspect rather than a fixed height: the banner is the
          // whole reason an article stands out in a feed of short notes, and
          // a 160px strip made it look like a broken thumbnail.
          className="aspect-[2/1] w-full bg-lc-black object-cover"
        />
      ) : (
        // Without a banner the card had no visual weight at all and read as
        // a slightly indented note.
        <div className="flex aspect-[4/1] w-full items-center justify-center bg-gradient-to-br from-lc-olive/40 to-lc-black">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-lc-green/60" aria-hidden="true">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
        </div>
      )}
      <div className="space-y-2 p-4">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-lc-green">
          <span>{t('social.article')}</span>
          <span aria-hidden="true">·</span>
          <span className="normal-case tracking-normal text-lc-muted">
            {minutes} {t('social.minRead')}
          </span>
        </div>
        <h3 className="line-clamp-2 text-lg font-bold leading-snug text-lc-white">
          {meta.title || t('social.untitledArticle')}
        </h3>
        {(meta.summary || note.content) && (
          <p className="line-clamp-3 text-sm leading-relaxed text-lc-muted">
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
      </div>

      {/*
        `prose-*` utilities aren't available here, so the typography comes
        from `.article-body` in globals.css — headings, lists, quotes and
        code sized for reading rather than for a chat bubble.
      */}
      <div className="article-body note-media mt-6 text-[15px] leading-7 text-lc-white">
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
