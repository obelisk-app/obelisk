/**
 * The bridgeCache key scheme, shared by the read/write half (`cache.ts`)
 * and the sweeps (`cache-sweep.ts`): one prefix per cache generation, then
 * `{relay}/{kind}/{id}`.
 */
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';

// v4, evicts metadata and message cache entries written before hidden NIP-29
// groups were privacy-gated. Relays repopulate visible groups after login.
//
// Older cache namespaces are orphaned and evicted on module load.
export const KEY_PREFIX = 'obelisk-cache-v4/';
export const LEGACY_KEY_PREFIXES = ['obelisk-cache/', 'obelisk-cache-v2/', 'obelisk-cache-v3/'] as const;

export function buildKey(relay: string, kind: number, id: string): string {
  // The relay URL can contain `:` and `/` which are fine in localStorage keys.
  // We don't encode them, collisions across relays already require identical
  // protocol+host+path which would be the same relay anyway.
  return `${KEY_PREFIX}${normalizeRelayUrl(relay)}/${kind}/${id}`;
}

export function isAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}
