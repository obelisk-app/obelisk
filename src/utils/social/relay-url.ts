/**
 * The social tier's relay URL check: a `wss://` URL without credentials, one
 * spelling per relay, or null. (`src/utils/relay-url/normalize.ts` is the
 * group relays' own, with a different signature.)
 */

import { isPublicWssUrl } from '@nostr-wot/data';

/**
 * Canonical form of a single relay URL, or `null` if it isn't usable from a
 * browser page. Delegates the safety judgement to the SDK's `isPublicWssUrl`,
 * which rejects non-`wss:` schemes, localhost/.local, and RFC-1918 / loopback
 * / link-local addresses, all of which would otherwise trip a CSP violation
 * and a console error on every page load.
 */
export function normalizeRelayUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  // Drop a bare trailing slash so `wss://a/` and `wss://a` dedupe.
  const canonical = url.toString().replace(/\/$/, '');
  return isPublicWssUrl(canonical) ? canonical : null;
}
