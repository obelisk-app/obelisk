/**
 * Per-pubkey relay lists the DM path looks up before a send: a recipient's
 * NIP-65 read relays (kind 10002) and a partner's NIP-17 inbox (kind 10050).
 * Design §5, relay lists: FIFO, 1,000 entries, 6 h positive, 15 min
 * negative. Every entry has the same TTL, so insertion order is expiry
 * order and FIFO is exact TTL eviction at O(1); reads are not
 * recency-skewed (you message a partner, then not for a day), so LRU would
 * buy nothing. An empty list is a real answer (the relay said so) and is
 * cached, but for a quarter of an hour rather than six, so a peer who
 * publishes an inbox list later is not pinned to the fallback ladder for
 * the rest of the afternoon. Before this the two maps grew by one entry per
 * pubkey ever messaged and never expired an entry on their own.
 */
import { BoundedMap } from '@/lib/relay-hub';

export const RELAY_LIST_CACHE_MAX = 1000;
export const RELAY_LIST_TTL_MS = 6 * 3600 * 1000;
export const RELAY_LIST_NEGATIVE_TTL_MS = 15 * 60 * 1000;

export class RelayListCache {
  private readonly map: BoundedMap<string, readonly string[]>;

  constructor(opts: { now?: () => number } = {}) {
    this.map = new BoundedMap<string, readonly string[]>({
      maxEntries: RELAY_LIST_CACHE_MAX,
      policy: 'fifo',
      ttlMs: RELAY_LIST_TTL_MS,
      now: opts.now,
    });
  }

  get size(): number {
    return this.map.size;
  }

  /** The cached list, or undefined when unknown or expired. An empty list is a cached "none". */
  get(pubkey: string): readonly string[] | undefined {
    return this.map.peek(pubkey);
  }

  set(pubkey: string, relays: readonly string[]): void {
    this.map.set(pubkey, relays, { ttlMs: relays.length > 0 ? RELAY_LIST_TTL_MS : RELAY_LIST_NEGATIVE_TTL_MS });
  }

  clear(): void {
    this.map.clear();
  }
}
