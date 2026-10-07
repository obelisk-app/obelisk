import { setPreference } from '@/services/preferences/preferences';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { normalizeFeedWidgets, toggleFeedWidget, type FeedWidgetId } from '@/services/social/widgets';
import { feedWidgetOptions } from '@/utils/social/feed-widget-options';

/**
 * The feed side column's view model: the widgets the reader picked (from
 * preferences, cleaned of stale ids), the picker's rows, and the toggle that
 * writes the choice back.
 */
export function useFeedWidgets() {
  const selected = normalizeFeedWidgets(usePreferences().feedWidgets);
  return {
    selected,
    options: feedWidgetOptions(selected),
    toggle: (id: FeedWidgetId) => setPreference('feedWidgets', toggleFeedWidget(selected, id)),
  };
}

export type FeedWidgetsModel = ReturnType<typeof useFeedWidgets>;
