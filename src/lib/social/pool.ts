/**
 * The one shared pool for Nostr-proper (non-NIP-29) reads.
 *
 * Before this module, `NostrProfile` did `new SimplePool()` inside a mount
 * effect — so every open profile meant an independent set of sockets to
 * damus/nos.lol/primal, and closing the component destroyed the pool along
 * with any warm connection. Two profiles open = two full connection sets.
 *
 * `@nostr-wot/data` already owns a process-wide pool (`getPool`) and a
 * request coalescer (`sharedCoalescer`) that merges every REQ issued against
 * the same relay set within a 50ms window into ONE subscription. Routing all
 * social reads through it means the feed, the profile feed, and engagement
 * counts share sockets and dedupe their filters for free.
 */

import {
  configurePersistence,
  fetchRelayList,
  getDefaultRelays,
  setDefaultRelays,
  sharedCoalescer,
} from '@nostr-wot/data';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { DEFAULT_SOCIAL_RELAYS, SOCIAL_RELAY_MAX, normalizeSocialRelays } from './relays';

/** localStorage namespace for the SDK's own TTL cache. Swept by cache-clear.ts. */
export const SOCIAL_SDK_CACHE_NAMESPACE = 'obelisk-social-sdk/';

const SDK_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let initialized = false;

/**
 * Point the SDK at the user's social relays. Safe to call repeatedly — the
 * settings panel calls it on every save so subsequent fetches route to the
 * new set without a reload.
 */
export function applySocialRelays(relays: readonly string[]): void {
  setDefaultRelays(normalizeSocialRelays(relays));
}

/** Called once from the app shell, before any social read. */
export function initSocial(relays: readonly string[] = DEFAULT_SOCIAL_RELAYS): void {
  applySocialRelays(relays);
  if (initialized) return;
  initialized = true;
  configurePersistence({ namespace: SOCIAL_SDK_CACHE_NAMESPACE, ttlMs: SDK_CACHE_TTL_MS });
}

export function socialRelays(): string[] {
  return getDefaultRelays();
}

/**
 * One-shot query through the shared coalescer. Resolves on EOSE-from-all or
 * the timeout, whichever comes first.
 */
export function querySocial(
  filters: Filter[],
  opts: { relays?: readonly string[]; timeoutMs?: number } = {},
): Promise<NostrEvent[]> {
  const relays = opts.relays?.length ? [...opts.relays] : socialRelays();
  return sharedCoalescer.querySync(filters, {
    relays,
    ...(opts.timeoutMs === undefined ? {} : { timeoutMs: opts.timeoutMs }),
  });
}

/**
 * Live subscription through the shared coalescer. Returns a teardown; the
 * underlying REQ is only closed once the last consumer lets go.
 */
export function subscribeSocial(
  filters: Filter[],
  onEvent: (event: NostrEvent) => void,
  opts: { relays?: readonly string[]; onEose?: (relay: string) => void } = {},
): () => void {
  const relays = opts.relays?.length ? [...opts.relays] : socialRelays();
  return sharedCoalescer.enqueue({
    filters,
    relays,
    onEvent,
    ...(opts.onEose ? { onEose: opts.onEose } : {}),
  });
}

/**
 * Pull the user's own NIP-65 (kind 10002) list so Settings can offer
 * "Import my relays" instead of making them retype URLs they already
 * published. Read relays are what a *reader* wants, so we take the union and
 * let `normalizeSocialRelays` drop anything a browser can't reach.
 */
export async function importNip65Relays(pubkey: string): Promise<string[]> {
  const entry = await fetchRelayList(pubkey);
  if (!entry) return [];
  // `fetchRelayList` already returns a parsed { read[], write[] } entry, so
  // there's nothing left to parse. Read relays are where a reader should
  // look; write relays are included because most people publish a single
  // combined list and `normalizeSocialRelays` dedupes + caps anyway.
  return normalizeSocialRelays([...entry.read, ...entry.write]).slice(0, SOCIAL_RELAY_MAX);
}
