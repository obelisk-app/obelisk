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

/**
 * The four a new account reads from.
 *
 * `relay.nostr.band` used to be the fourth and is deliberately no longer
 * here. It is a search index rather than a general relay, and it does not
 * reliably connect: measured 2026-09-25 it hard-timed-out at 8s from a
 * network path where every other relay in this file answered in under a
 * second, and `useNostrUserSearch` had already recorded it "errored after
 * ~10s" on 2026-09-17. A default set of four where one never answers is how
 * the header came to read 3/4 forever.
 *
 * It keeps its place in `SOCIAL_RELAY_PRESETS` as the `search` entry, so it
 * is still one click away for anyone who wants it — and `NIP50_RELAYS` in
 * `useNostrUserSearch` still queries it for search, where it is the best
 * index available and its failures are already tolerated.
 *
 * `relay.snort.social` replaces it: verified full kind-1 coverage at ~270ms,
 * and already one of the SDK's own `DEFAULT_RELAYS`.
 *
 * Changing this list changes `socialRelayKey`, so existing feed caches are
 * keyed under the old set and are simply re-fetched once. That is the
 * intended cost, not a bug.
 */
export const DEFAULT_SOCIAL_RELAYS: readonly string[] = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
];

/**
 * Relays to widen into when a feed runs out.
 *
 * "That's everything the relays had" is often a statement about the four
 * relays configured, not about Nostr: a small or unlucky relay set exhausts
 * after a couple of pages while the same query has plenty more elsewhere.
 * When paging goes dry we retry once against this wider set before telling
 * the reader there's nothing left.
 *
 * Deliberately not added to the user's configured set: widening is a
 * last-resort read, not a silent change to where their client lives.
 */
export const WIDER_SOCIAL_RELAYS: readonly string[] = [
  ...DEFAULT_SOCIAL_RELAYS,
  // `relay.snort.social` was listed here and is now a default, so it is not
  // repeated. `relay.nostr.bg` was dropped — it refused the connection
  // outright when measured alongside the others on 2026-09-25, and a
  // last-resort widen is the one place a dead relay is pure latency: the
  // caller is already waiting because the feed came back empty.
  'wss://nostr.wine',
  'wss://nostr.mom',
  'wss://offchain.pub',
];

/** The user's relays plus the fallback set, deduped. */
export function widenedRelays(relays: readonly string[]): string[] {
  return [...new Set([...relays, ...WIDER_SOCIAL_RELAYS])];
}

/**
 * Relays offered as one-click additions in settings.
 *
 * The relay list started as four text boxes you had to fill from memory,
 * which is a fine interface for someone who already knows four relay
 * hostnames and a dead end for everyone else — the most common reason a
 * feed looks empty is a relay set nobody ever chose. These are the
 * well-known public ones, each with a note saying what it is for, because
 * "add another relay" is only useful advice if you know which.
 *
 * `note` is an i18n key suffix under `preferences.socialRelays.preset.*`,
 * not copy — the list is data and has to survive translation.
 */
export interface RelayPreset {
  url: string;
  note: 'general' | 'index' | 'search' | 'paid' | 'profiles';
}

export const SOCIAL_RELAY_PRESETS: readonly RelayPreset[] = [
  { url: 'wss://relay.damus.io', note: 'general' },
  { url: 'wss://nos.lol', note: 'general' },
  { url: 'wss://relay.primal.net', note: 'index' },
  { url: 'wss://relay.nostr.band', note: 'search' },
  { url: 'wss://relay.snort.social', note: 'general' },
  { url: 'wss://offchain.pub', note: 'general' },
  { url: 'wss://nostr.wine', note: 'paid' },
  { url: 'wss://purplepag.es', note: 'profiles' },
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
