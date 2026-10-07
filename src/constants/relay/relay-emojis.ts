/**
 * Relay: relay emojis. Values the code in `services/relay/relay-emojis.ts`
 * reads, kept here so every reader imports the one copy.
 */

import type { RelayEmojiSet } from '@/services/relay/relay-emojis';

export const EMPTY_RELAY_EMOJI_SET: RelayEmojiSet = {
  title: '',
  emojis: [],
  packAddresses: [],
  updatedAt: 0,
};
