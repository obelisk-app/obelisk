/**
 * Browser-CSP-aware NIP-65 / NIP-17 relay-list parsers.
 *
 * The SDK's `parseRelayList` (kind 10002) handles the basic shape but
 * doesn't filter relay URLs that violate Obelisk's page CSP (loopback,
 * RFC-1918, non-`wss:`). The bridge and DM relay cache also need a
 * kind 10050 (NIP-17 inbox) parser, which the SDK doesn't currently
 * expose. Both helpers stay here because they're load-bearing for the
 * bridge (which we don't refactor) and the DM relay-list cache.
 */

import type { Event as NostrEvent } from 'nostr-tools/pure';

/**
 * Browser-CSP + sanity filter for relay URLs imported from kind 10002 /
 * 10050 events. The page CSP only allows `wss:` in `connect-src`, and a
 * URL pointing at a localhost / loopback / RFC-1918 host (which clients
 * like Coracle and self-hosted dev rigs sometimes accidentally publish)
 * triggers a `WebSocket connection failed` plus a CSP violation per page
 * load. We drop those at the parser so downstream consumers (DM relay
 * cache, NIP-65 dialer, recipient lookup) never call
 * `new WebSocket(badUrl)`.
 */
function isImportableNostrRelayUrl(url: string): boolean {
  let p: URL;
  try { p = new URL(url); } catch { return false; }
  if (p.protocol !== 'wss:') return false;
  const host = p.hostname.toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  if (/^127\./.test(host)) return false;
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return false;
  if (host === '0.0.0.0' || host === '::1' || host.startsWith('fe80:')) return false;
  return true;
}

/**
 * Parse a kind 10002 (NIP-65 relay-list metadata) event into the read/write
 * URL split. Markers: untagged `r` URLs are both read and write; explicit
 * `read` / `write` markers narrow the membership. URLs that violate the
 * page CSP (non-`wss:`, localhost, loopback, RFC-1918) are filtered out
 * — see {@link isImportableNostrRelayUrl}.
 */
export function parseRelayListMeta(event: NostrEvent): { read: string[]; write: string[] } {
  const read = new Set<string>();
  const write = new Set<string>();
  for (const tag of event.tags) {
    if (tag[0] !== 'r' || typeof tag[1] !== 'string') continue;
    const url = tag[1];
    if (!isImportableNostrRelayUrl(url)) continue;
    const marker = tag[2];
    if (!marker || marker === 'read') read.add(url);
    if (!marker || marker === 'write') write.add(url);
  }
  return { read: Array.from(read), write: Array.from(write) };
}

/**
 * Parse a kind 10050 (NIP-17 DM inbox relays) event into the URL list.
 * Accepts both `relay` and `r` tag names for compatibility with clients
 * that publish either form. Same CSP/loopback filter as kind 10002.
 */
export function parseInboxRelays(event: NostrEvent): string[] {
  const out = new Set<string>();
  for (const tag of event.tags) {
    if ((tag[0] === 'relay' || tag[0] === 'r') && typeof tag[1] === 'string') {
      if (isImportableNostrRelayUrl(tag[1])) out.add(tag[1]);
    }
  }
  return Array.from(out);
}
