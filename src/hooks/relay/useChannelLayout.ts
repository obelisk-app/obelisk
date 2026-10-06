'use client';

import { EMPTY_LAYOUT, subscribeLayout, type ChannelLayout } from '@/services/channel-layout';
import { useRelayScopedValue } from './useRelayScopedValue';

/** The operator's channel layout for `relayUrl` (NIP-78), or the empty layout until one arrives. */
export function useChannelLayout(
  relayUrl: string | null,
  authors: ReadonlyArray<string>,
): ChannelLayout {
  return useRelayScopedValue(relayUrl, authors, subscribeLayout, EMPTY_LAYOUT);
}
