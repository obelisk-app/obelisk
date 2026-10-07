'use client';

import { subscribeBranding, type RelayBranding } from '@/services/relay/relay-branding';
import { EMPTY_BRANDING } from '@/constants/relay/relay-branding';
import { useRelayScopedValue } from '../operator/useRelayScopedValue';

/** The operator's branding for `relayUrl` (NIP-78), or empty branding until it arrives. */
export function useRelayBranding(
  relayUrl: string | null,
  authors: ReadonlyArray<string>,
): RelayBranding {
  return useRelayScopedValue(relayUrl, authors, subscribeBranding, EMPTY_BRANDING);
}
