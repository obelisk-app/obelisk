/**
 * Social relay set — the FOURTH relay tier in this app.
 *
 * Obelisk already juggles three relay tiers (see CLAUDE.md "Single-relay
 * rule"): NIP-29 group relays, profile-lookup relays, and DM (NIP-65) relays.
 * "Social" is a fourth, and it must not be confused with any of them:
 *
 *   - Group relays serve kinds 9 / 39000-39002 and are whitelist-gated. Fanning
 *     a kind-1 REQ across them opens authenticated sockets to relays the user
 *     isn't browsing and produces the documented
 *     `Tried to send AUTH on a closed connection` loop.
 *   - Social relays serve ordinary Nostr traffic (kind 1 and friends) and are
 *     public. Nothing here ever touches `useConfiguredRelays()`.
 *
 * This module replaces the old `profileFeedRelays` contract, which hard-locked
 * the user to EXACTLY three relays — `parseProfileFeedRelays` returned `null`
 * for any other count, so there was no way to add a fourth or drop to two.
 */

import { isPublicWssUrl } from '@nostr-wot/data';

export const SOCIAL_RELAY_MIN = 1;
export const SOCIAL_RELAY_MAX = 8;

export const DEFAULT_SOCIAL_RELAYS: readonly string[] = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.band',
];

/**
 * Canonical form of a single relay URL, or `null` if it isn't usable from a
 * browser page. Delegates the safety judgement to the SDK's `isPublicWssUrl`,
 * which rejects non-`wss:` schemes, localhost/.local, and RFC-1918 / loopback
 * / link-local addresses — all of which would otherwise trip a CSP violation
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

/**
 * Coerce arbitrary persisted/user input into a usable relay list.
 *
 * Unlike the old exactly-three rule this never rejects wholesale: invalid
 * entries are dropped individually and the rest are kept, because throwing
 * away a user's seven good relays because the eighth had a typo is worse
 * than the typo. Falls back to defaults only when nothing survives.
 */
export function normalizeSocialRelays(value: unknown): string[] {
  const input = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  for (const entry of input) {
    const relay = normalizeRelayUrl(entry);
    if (relay) seen.add(relay);
    if (seen.size >= SOCIAL_RELAY_MAX) break;
  }
  return seen.size >= SOCIAL_RELAY_MIN ? [...seen] : [...DEFAULT_SOCIAL_RELAYS];
}

/** Which entries of a draft list are invalid, for inline form feedback. */
export function invalidRelayIndexes(draft: readonly string[]): number[] {
  const bad: number[] = [];
  draft.forEach((entry, index) => {
    if (entry.trim() && !normalizeRelayUrl(entry)) bad.push(index);
  });
  return bad;
}

/**
 * Stable cache-namespace key for a relay set.
 *
 * The bridgeCache is keyed by relay, and notes read from one relay set must
 * not be served to another — otherwise switching relays paints stale content
 * that the new set may not even carry. Sorted so member order doesn't matter.
 */
export function socialRelayKey(relays: readonly string[]): string {
  return `social:${[...relays].sort().join(',')}`;
}
