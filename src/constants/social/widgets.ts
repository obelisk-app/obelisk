/**
 * Social: widgets. Values the code in
 * `hooks/social/widgets/useTrendingWidget.ts`,
 * `hooks/social/widgets/useWhoToFollowWidget.ts`, `services/social/widgets.ts`
 * reads, kept here so every reader imports the one copy.
 */

import type { FeedWidgetId } from '@/utils/social/widgets';

/** How many tags the side column lists. */
export const TRENDING_WIDGET_LIMIT = 8;

/** How many people the side column suggests. */
export const WHO_TO_FOLLOW_LIMIT = 5;

export const FEED_WIDGETS = [
  'trending',
  'who-to-follow',
  'followed-tags',
  'relays',
] as const;

/**
 * Two, because that is roughly what fits above the fold at 900px tall, and a
 * reader who never opens the picker should still see a full column rather
 * than a scroll. Tags and people: what the feed is about, and who is in it.
 */
export const DEFAULT_FEED_WIDGETS: readonly FeedWidgetId[] = ['trending', 'who-to-follow'];

/** How many can be shown at once; past this the column stops being a sidebar. */
export const FEED_WIDGET_MAX = 4;
