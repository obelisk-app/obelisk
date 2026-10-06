'use client';

import { EMPTY_RELAY_ROLES, subscribeRelayRoles, type RelayRoles } from '@/services/relay-roles';
import { useRelayScopedValue } from './useRelayScopedValue';

/** The operator's role catalog and holders for `relayUrl` (NIP-78), or no roles until they arrive. */
export function useRelayRoles(
  relayUrl: string | null,
  authors: ReadonlyArray<string>,
): RelayRoles {
  return useRelayScopedValue(relayUrl, authors, subscribeRelayRoles, EMPTY_RELAY_ROLES);
}
