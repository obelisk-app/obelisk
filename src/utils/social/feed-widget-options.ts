import type { FeedWidgetId } from '@/utils/social/widgets';
import { FEED_WIDGETS } from '@/constants/social/widgets';

export interface FeedWidgetOption {
  id: FeedWidgetId;
  /** Shown in the column now. */
  on: boolean;
  /**
   * The last one on can't be switched off: an empty column reads as a bug
   * rather than as a choice.
   */
  locked: boolean;
}

/** The picker's rows: every widget in catalogue order, with whether it is on and whether it may be switched off. */
export function feedWidgetOptions(selected: readonly FeedWidgetId[]): FeedWidgetOption[] {
  return FEED_WIDGETS.map((id) => {
    const on = selected.includes(id);
    return { id, on, locked: on && selected.length === 1 };
  });
}
