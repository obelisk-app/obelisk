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
  TextCoercingWebSocket,
  configurePersistence,
  fetchRelayList,
  getDefaultRelays,
  getPool,
  setDefaultRelays,
  setPool,
  sharedCoalescer,
} from '@nostr-wot/data';
import { SimplePool } from 'nostr-tools';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { DEFAULT_SOCIAL_RELAYS, SOCIAL_RELAY_MAX, normalizeSocialRelays } from './relays';

/** localStorage namespace for the SDK's own TTL cache. Swept by cache-clear.ts. */
export const SOCIAL_SDK_CACHE_NAMESPACE = 'obelisk-social-sdk/';

const SDK_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let initialized = false;

/**
 * Connection callbacks, set by `relay-status.ts`. Indirected through a
 * mutable holder rather than imported so the two modules don't form a cycle:
 * relay-status needs the pool, and the pool needs its callbacks.
 */
export const poolEvents: {
  onConnect?: (url: string) => void;
  onFailure?: (url: string) => void;
} = {};

/**
 * Own the pool, at module scope.
 *
 * `@nostr-wot/data`'s `getPool()` lazily does `new SimplePool()` with no
 * options — no connection callbacks, no ping, no WebSocket override. Those
 * are constructor-only, so the only way to have them is to install our own
 * pool BEFORE anything calls `getPool()`.
 *
 * This runs at import rather than from `initSocial()` because `initSocial`
 * is called from an AppGate effect, and React runs child effects before
 * parent ones — a feed read in a shell below it would create the default
 * pool first and then have it swapped out from under a live subscription.
 * Module scope is the only placement that's ordered correctly by
 * construction.
 */
let poolInstalled = false;
function installPool(): void {
  if (poolInstalled) return;
  poolInstalled = true;
  try {
    setPool(new SimplePool({
      enablePing: true,
      // Same coercion the bridge uses: some relays send Blob frames.
      websocketImplementation: TextCoercingWebSocket as unknown as typeof WebSocket,
      onRelayConnectionSuccess: (url: string) => poolEvents.onConnect?.(url),
      onRelayConnectionFailure: (url: string) => poolEvents.onFailure?.(url),
    } as ConstructorParameters<typeof SimplePool>[0]));
  } catch {
    // A pool we can't configure is still a working pool — fall back to the
    // SDK's rather than breaking every read for the sake of status dots.
  }
}

installPool();

/** The configured pool. Never construct one alongside this. */
export function socialPool(): ReturnType<typeof getPool> {
  installPool();
  return getPool();
}

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
