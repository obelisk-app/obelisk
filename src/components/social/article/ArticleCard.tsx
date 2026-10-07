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

import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslations } from 'next-intl';
import RemoteImage from '@/components/ui/media/RemoteImage';
import Text from '@/components/ui/layout/Text';
import { useArticleCard } from '@/hooks/social/article/useArticleCard';
export { articleMeta, readingMinutes, type ArticleMeta } from '@/utils/social/article-meta';
/**
 * The reader lives in `ArticleReader.tsx`; it stays this module's default
 * export because the reader pane, the note viewer and the profile import it
 * from here.
 */
export { default } from './ArticleReader';

/** Compact card for a feed row. */
export function ArticleCard({
  note,
  onOpen,
}: {
  note: NostrEvent;
  onOpen?: () => void;
}) {
  const t = useTranslations();
  const { meta, minutes, excerpt } = useArticleCard(note);

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
            {t('social.minReadCount', { minutes })}
          </span>
        </Text>
        <h3 className="line-clamp-2 text-base font-bold leading-snug text-lc-white">
          {meta.title || t('social.untitledArticle')}
        </h3>
        {(meta.summary || note.content) && (
          <p className="line-clamp-2 text-[13px] leading-relaxed text-lc-muted">
            {excerpt}
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
