/**
 * Read state: selectors. Values the code in `services/read-state/selectors.ts`
 * reads, kept here so every reader imports the one copy.
 */

import type { ChannelHighlights } from '@/services/read-state/selectors';

export const EMPTY_HIGHLIGHTS: ChannelHighlights = {
  unread: 0,
  mentions: 0,
  replies: 0,
  eventIds: [],
};
