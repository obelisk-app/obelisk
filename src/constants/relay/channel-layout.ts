/**
 * Relay: channel layout. Values the code in `services/relay/channel-layout.ts`
 * reads, kept here so every reader imports the one copy.
 */

import type { ChannelLayout } from '@/services/relay/channel-layout';

export const EMPTY_LAYOUT: ChannelLayout = { categories: [], channels: [], updatedAt: 0 };
