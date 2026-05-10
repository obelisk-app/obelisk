/**
 * Browser-CSP-aware NIP-65 / NIP-17 relay-list parsers.
 *
 * Thin adapters over `@nostr-wot/data`'s `parseRelayList(event, 'public')`
 * and `parseInboxRelayList(event, 'public')`, which apply Obelisk's
 * page-CSP filter (drop loopback / RFC-1918 / non-`wss:` URLs) so the
 * bridge and DM relay cache never call `new WebSocket(badUrl)`.
 *
 * The shape of `parseRelayListMeta`'s return value (`{ read, write }`) is
 * narrower than the SDK's `RelayListEntry` so existing callers in the
 * bridge + DM cache can stay unchanged.
 */

import type { Event as NostrEvent } from 'nostr-tools/pure';
import { parseRelayList, parseInboxRelayList } from '@nostr-wot/data';

/**
 * Parse a kind 10002 (NIP-65 relay-list metadata) event into the read/write
 * URL split. URLs that violate the page CSP (non-`wss:`, localhost, loopback,
 * RFC-1918) are filtered out.
 */
export function parseRelayListMeta(event: NostrEvent): { read: string[]; write: string[] } {
  const entry = parseRelayList(event, 'public');
  return { read: entry.read, write: entry.write };
}

/**
 * Parse a kind 10050 (NIP-17 DM inbox relays) event into the URL list.
 * Accepts both `relay` and `r` tag names. Same CSP/loopback filter as
 * kind 10002.
 */
export function parseInboxRelays(event: NostrEvent): string[] {
  return parseInboxRelayList(event, 'public');
}
