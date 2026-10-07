/**
 * The engine's verdict cache: one entry per resolved author, with a TTL and
 * a hard ceiling.
 *
 * The ceiling exists because every distinct author the relay shows us gets
 * an entry, and a relay (or one spammer with a key generator) can show us an
 * unbounded number of them; without it the map grew for the life of the
 * page. Entries are small, so the default is generous: it is a memory
 * bound, not a working-set estimate. When it is reached, lapsed entries go
 * first, then the oldest.
 */

import { DEFAULT_MAX_CACHE_ENTRIES } from '@/constants/wot/verdict-cache';

export type Verdict = 'allow' | 'deny';

export interface VerdictEntry {
  verdict: Verdict;
  /** Hop distance for `allow` verdicts (used by the WotBadge UI). `null` means resolved-allow with no distance number. */
  distance: number | null;
  expiresAt: number;
}

export class VerdictCache {
  /** Insertion-ordered, so the first key is the least recently resolved. */
  private readonly entries = new Map<string, VerdictEntry>();
  readonly maxEntries: number;

  constructor(maxEntries: number = DEFAULT_MAX_CACHE_ENTRIES) {
    this.maxEntries = Math.max(1, maxEntries);
  }

  get(pubkey: string): VerdictEntry | undefined {
    return this.entries.get(pubkey);
  }

  /** Cached and not yet lapsed. */
  isFresh(pubkey: string, now: number = Date.now()): boolean {
    const entry = this.entries.get(pubkey);
    return entry !== undefined && entry.expiresAt > now;
  }

  /**
   * Store a resolved verdict. Delete first so a refreshed key moves to the
   * back of the eviction order instead of keeping the slot it got when
   * first resolved.
   */
  set(pubkey: string, entry: VerdictEntry): void {
    this.entries.delete(pubkey);
    this.entries.set(pubkey, entry);
  }

  /**
   * Keep the cache under its ceiling with `incoming` new entries about to
   * land. Lapsed entries go first: they were only being kept so a refresh
   * could serve the stale verdict in the meantime. If that is not enough,
   * the least recently resolved go next; a pubkey evicted while still
   * current simply resolves again the next time it is seen.
   */
  makeRoom(incoming: number, now: number = Date.now()): void {
    if (this.entries.size + incoming <= this.maxEntries) return;
    for (const [pk, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(pk);
    }
    let excess = this.entries.size + incoming - this.maxEntries;
    if (excess <= 0) return;
    for (const pk of this.entries.keys()) {
      if (excess <= 0) break;
      this.entries.delete(pk);
      excess -= 1;
    }
  }

  /** Current (unlapsed) verdict counts. */
  counts(now: number = Date.now()): { allow: number; deny: number } {
    let allow = 0;
    let deny = 0;
    for (const [, v] of this.entries) {
      if (v.expiresAt <= now) continue;
      if (v.verdict === 'allow') allow++;
      else deny++;
    }
    return { allow, deny };
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}
