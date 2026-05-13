/**
 * Normalize a relay URL for equality comparison: lowercase host/scheme and
 * strip trailing slashes. nostr-tools occasionally passes a URL with the
 * slash and occasionally without, so direct string compare is unreliable.
 *
 * Same function as the one previously inlined in `client.ts`, `cache.ts`,
 * and `stores.ts` — consolidated here so cache pools, auth state maps, and
 * relay equality checks all agree on what counts as "the same relay."
 */
export function normalizeRelayUrl(u: string): string {
  return u.replace(/\/+$/, '').toLowerCase();
}
