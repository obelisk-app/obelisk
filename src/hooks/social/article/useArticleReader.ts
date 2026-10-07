import { useMemo } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useLocale } from 'next-intl';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { useArticleHighlights } from '@/hooks/social/article/useArticleHighlights';
import { articleDate, articleMeta, readingMinutes } from '@/utils/social/article-meta';

/**
 * The full reader's view model: the article's tags and reading time, the
 * author's name and picture, the publication date in the app's locale, and
 * the reader highlights with their toggle.
 */
export function useArticleReader(note: NostrEvent) {
  const locale = useLocale();
  const author = useAuthor(note.pubkey);
  const meta = useMemo(() => articleMeta(note), [note]);
  const minutes = useMemo(() => readingMinutes(note.content), [note.content]);
  const { showHighlights, setShowHighlights, highlights, runs, bodyRef } = useArticleHighlights(note);

  return {
    meta,
    minutes,
    author,
    name: author?.displayName || author?.name || note.pubkey.slice(0, 10),
    published: meta.publishedAt ? articleDate(locale, meta.publishedAt) : null,
    showHighlights,
    toggleHighlights: () => setShowHighlights((value) => !value),
    /** How many highlighted runs to show beside the toggle, once fetched. */
    highlightCount: showHighlights && highlights !== null ? runs.length : null,
    bodyRef,
  };
}
