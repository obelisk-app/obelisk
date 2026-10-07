/**
 * The bridgeCache key scheme, shared by the read/write half (`cache.ts`)
 * and the sweeps (`cache-sweep.ts`): one prefix per cache generation, then
 * `{relay}/{kind}/{id}`.
 */
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import { KEY_PREFIX } from '@/constants/nostr-bridge/cache';

export function buildKey(relay: string, kind: number, id: string): string {
  // The relay URL can contain `:` and `/` which are fine in localStorage keys.
  // We don't encode them, collisions across relays already require identical
  // protocol+host+path which would be the same relay anyway.
  return `${KEY_PREFIX}${normalizeRelayUrl(relay)}/${kind}/${id}`;
}

export function isAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}
