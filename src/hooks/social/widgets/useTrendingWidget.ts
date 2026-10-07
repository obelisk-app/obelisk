import { useMemo } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { trendingTags } from '@/services/social/trending';
import { TRENDING_WIDGET_LIMIT } from '@/constants/social/widgets';

/** The trending widget's view model: the loaded window's top hashtags. */
export function useTrendingWidget(notes: readonly NostrEvent[]) {
  const tags = useMemo(() => trendingTags(notes, { limit: TRENDING_WIDGET_LIMIT }), [notes]);
  return { tags };
}
