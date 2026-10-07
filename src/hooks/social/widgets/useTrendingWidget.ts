import { useMemo } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { trendingTags } from '@/services/social/trending';

/** How many tags the side column lists. */
export const TRENDING_WIDGET_LIMIT = 8;

/** The trending widget's view model: the loaded window's top hashtags. */
export function useTrendingWidget(notes: readonly NostrEvent[]) {
  const tags = useMemo(() => trendingTags(notes, { limit: TRENDING_WIDGET_LIMIT }), [notes]);
  return { tags };
}
