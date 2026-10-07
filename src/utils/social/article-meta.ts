import type { Event as NostrEvent } from 'nostr-tools';
import { formatDate } from '@/utils/format/format';
import type { Locale } from '@/i18n';


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

export function articleDate(locale: Locale, seconds: number): string {
  return formatDate(locale, seconds, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** The card's teaser: the author's summary, else the opening of the body with the markdown marks stripped. */
export function articleExcerpt(meta: Pick<ArticleMeta, 'summary'>, content: string): string {
  return meta.summary || content.replace(/[#*_`>[\]()!]/g, '').slice(0, 220);
}
