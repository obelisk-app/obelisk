/**
 * Social: relays. Values the code in `services/social/relays.ts` reads, kept
 * here so every reader imports the one copy.
 */

import type { RelayPreset } from '@/services/social/relays';

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
 * is still one click away for anyone who wants it, and `NIP50_RELAYS` in
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
  // repeated. `relay.nostr.bg` was dropped: it refused the connection
  // outright when measured alongside the others on 2026-09-25, and a
  // last-resort widen is the one place a dead relay is pure latency: the
  // caller is already waiting because the feed came back empty.
  'wss://nostr.wine',
  'wss://nostr.mom',
  'wss://offchain.pub',
];

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
