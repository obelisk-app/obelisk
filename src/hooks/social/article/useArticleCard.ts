import { useMemo } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { articleExcerpt, articleMeta, readingMinutes } from '@/utils/social/article-meta';

/** The feed card's view model: the article's tags, reading time and teaser, read once per note. */
export function useArticleCard(note: NostrEvent) {
  const meta = useMemo(() => articleMeta(note), [note]);
  const minutes = useMemo(() => readingMinutes(note.content), [note.content]);
  return { meta, minutes, excerpt: articleExcerpt(meta, note.content) };
}
