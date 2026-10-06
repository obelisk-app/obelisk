/**
 * Kind-0 profile cache, the owner's ruling (DECISIONS §4):
 *
 *  - LRU, 5,000 entries, so scrolling a large member directory does not
 *    refetch avatars; `get` is the recency signal because the active
 *    channel's members and the people on screen are read on every render.
 *  - Trim to 2,000 after the document has been hidden for 5 minutes.
 *    Invisible to the user, keeps a backgrounded mobile shell near the
 *    lower number. The timer is cancelled if the tab becomes visible first.
 *  - A separate negative set for pubkeys with no kind 0, with a cooldown
 *    (30 min) so a missing profile is not refetched on every render. It is
 *    FIFO-bounded at 2,000; a pubkey that is seen again after its cooldown
 *    is simply fetched once more.
 *
 * Memory arithmetic (V8-realistic: 64-char hex key ~80 B, Map entry ~40 B,
 * object header 24 B + 8 B per field, short strings ~20 B over length):
 *   positive entry: value object with name/about/picture/nip05 strings
 *                   ~500 B + holder {value, fetchedAt} 48 B + key 80 B + Map 40 B
 *                   + BoundedMap entry record 56 B ≈ 725 B
 *   5,000 × 725 B ≈ 3.6 MB peak; after the hidden trim 2,000 × 725 B ≈ 1.45 MB
 *   negative entry: key 80 B + timestamp 8 B + Map 40 B ≈ 130 B; 2,000 × 130 B ≈ 260 KB
 *   ceiling ≈ 3.9 MB, steady-state background ≈ 1.7 MB
 *
 * Profiles are public data and shared across identities (DECISIONS §1).
 */
import { BoundedMap, type EvictReason } from './bounded-map';

export interface VisibilitySource {
  isHidden(): boolean;
  /** Returns an unsubscribe. */
  onChange(cb: () => void): () => void;
}

export interface ProfileCacheOptions<T = unknown> {
  readonly maxEntries?: number;        // default 5000
  readonly trimTo?: number;            // default 2000
  readonly hiddenTrimAfterMs?: number; // default 5 min
  readonly ttlMs?: number;             // default 24 h; `isFresh` horizon for refetch-on-read
  readonly negativeCooldownMs?: number;// default 30 min
  readonly negativeMax?: number;       // default 2000
  readonly now?: () => number;
  readonly visibility?: VisibilitySource | null;
  /**
   * An entry the cache let go of on its own: the LRU cap (`'capacity'`) or
   * the hidden-tab trim (`'trim'`). Not the caller's own `delete` / `clear`.
   * A view derived from the cache (the bridge's `userMetadata` store) drops
   * the same key here, so the bound is real and not just the cache's.
   */
  readonly onEvict?: (pubkey: string, value: T, reason: EvictReason) => void;
}

interface Holder<T> {
  value: T;
  fetchedAt: number;
}

export function documentVisibility(): VisibilitySource | null {
  if (typeof document === 'undefined') return null;
  return {
    isHidden: () => document.visibilityState === 'hidden',
    onChange: (cb) => {
      document.addEventListener('visibilitychange', cb);
      return () => document.removeEventListener('visibilitychange', cb);
    },
  };
}

export class ProfileCache<T> {
  private readonly entries: BoundedMap<string, Holder<T>>;
  private readonly negative: BoundedMap<string, number>;
  private readonly trimTo: number;
  private readonly hiddenTrimAfterMs: number;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;
  /** How many hidden-tab trims have fired; exposed for tests and the status panel. */
  trims = 0;

  constructor(opts: ProfileCacheOptions<T> = {}) {
    this.now = opts.now ?? Date.now;
    this.trimTo = opts.trimTo ?? 2000;
    this.hiddenTrimAfterMs = opts.hiddenTrimAfterMs ?? 5 * 60_000;
    this.ttlMs = opts.ttlMs ?? 24 * 60 * 60_000;
    const onEvict = opts.onEvict;
    this.entries = new BoundedMap<string, Holder<T>>({
      maxEntries: opts.maxEntries ?? 5000,
      policy: 'lru',
      now: this.now,
      onEvict: onEvict
        ? (pubkey, holder, reason) => {
            if (reason === 'capacity' || reason === 'trim') onEvict(pubkey, holder.value, reason);
          }
        : undefined,
    });
    this.negative = new BoundedMap<string, number>({
      maxEntries: opts.negativeMax ?? 2000,
      policy: 'fifo',
      ttlMs: opts.negativeCooldownMs ?? 30 * 60_000,
      now: this.now,
    });
    const visibility = opts.visibility === undefined ? documentVisibility() : opts.visibility;
    if (visibility) {
      this.unsubscribe = visibility.onChange(() => this.onVisibility(visibility.isHidden()));
      if (visibility.isHidden()) this.onVisibility(true);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  get negativeSize(): number {
    return this.negative.size;
  }

  /** Read and mark recently used. */
  get(pubkey: string): T | undefined {
    return this.entries.get(pubkey)?.value;
  }

  /** Read without touching recency. */
  peek(pubkey: string): T | undefined {
    return this.entries.peek(pubkey)?.value;
  }

  fetchedAt(pubkey: string): number | null {
    return this.entries.peek(pubkey)?.fetchedAt ?? null;
  }

  set(pubkey: string, value: T, fetchedAt = this.now()): void {
    this.negative.delete(pubkey);
    this.entries.set(pubkey, { value, fetchedAt });
  }

  /** A complete miss: remember it so the next render does not refetch. */
  markMissing(pubkey: string): void {
    if (this.entries.has(pubkey)) return;
    this.negative.set(pubkey, this.now());
  }

  isMissing(pubkey: string): boolean {
    return this.negative.has(pubkey);
  }

  /**
   * True when a lookup should go to the wire: no entry (or an entry older
   * than `ttlMs`) and no negative mark inside its cooldown.
   */
  shouldFetch(pubkey: string): boolean {
    const holder = this.entries.peek(pubkey);
    if (holder && this.now() - holder.fetchedAt < this.ttlMs) return false;
    if (this.negative.has(pubkey)) return false;
    return true;
  }

  delete(pubkey: string): void {
    this.entries.delete(pubkey);
    this.negative.delete(pubkey);
  }

  clear(): void {
    this.entries.clear();
    this.negative.clear();
  }

  dispose(): void {
    this.cancelHiddenTimer();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  // ---- internals ------------------------------------------------------------

  private onVisibility(hidden: boolean): void {
    if (!hidden) {
      this.cancelHiddenTimer();
      return;
    }
    if (this.hiddenTimer) return;
    this.hiddenTimer = setTimeout(() => {
      this.hiddenTimer = null;
      this.entries.trimTo(this.trimTo);
      this.trims += 1;
    }, this.hiddenTrimAfterMs);
  }

  private cancelHiddenTimer(): void {
    if (this.hiddenTimer) {
      clearTimeout(this.hiddenTimer);
      this.hiddenTimer = null;
    }
  }
}
