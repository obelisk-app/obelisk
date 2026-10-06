/**
 * The one cache primitive. Policy is chosen per class from the access
 * pattern (design §5; each cache's module header states its choice and the
 * memory arithmetic): `'lru'` reorders on `get`, `'fifo'` does not. Bounded by entry count, optionally by bytes with a caller
 * `sizeOf`, optionally by TTL (per entry override allowed). `N inserts ->
 * size <= maxEntries` holds for every policy, which is what the cache tests
 * assert for every class built on it.
 */

export type EvictionPolicy = 'lru' | 'fifo';
export type EvictReason = 'capacity' | 'bytes' | 'expired' | 'trim' | 'delete' | 'clear';

export interface BoundedMapOptions<K, V> {
  readonly maxEntries: number;
  readonly policy?: EvictionPolicy;
  readonly maxBytes?: number;
  readonly sizeOf?: (value: V, key: K) => number;
  readonly ttlMs?: number;
  readonly now?: () => number;
  readonly onEvict?: (key: K, value: V, reason: EvictReason) => void;
}

interface Entry<V> {
  value: V;
  bytes: number;
  expiresAt: number | null;
}

export class BoundedMap<K, V> {
  private readonly map = new Map<K, Entry<V>>();
  private readonly policy: EvictionPolicy;
  private readonly maxEntries: number;
  private readonly maxBytes: number | null;
  private readonly sizeOf: ((value: V, key: K) => number) | null;
  private readonly ttlMs: number | null;
  private readonly now: () => number;
  private readonly onEvict: ((key: K, value: V, reason: EvictReason) => void) | null;
  private totalBytes = 0;

  constructor(opts: BoundedMapOptions<K, V>) {
    if (!(opts.maxEntries >= 1)) throw new Error('BoundedMap: maxEntries must be >= 1');
    this.maxEntries = Math.floor(opts.maxEntries);
    this.policy = opts.policy ?? 'fifo';
    this.maxBytes = opts.maxBytes ?? null;
    this.sizeOf = opts.sizeOf ?? null;
    this.ttlMs = opts.ttlMs ?? null;
    this.now = opts.now ?? Date.now;
    this.onEvict = opts.onEvict ?? null;
  }

  get size(): number {
    return this.map.size;
  }

  get bytes(): number {
    return this.totalBytes;
  }

  has(key: K): boolean {
    return this.peek(key) !== undefined;
  }

  /** Read without reordering. Expired entries are removed and reported absent. */
  peek(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.remove(key, entry, 'expired');
      return undefined;
    }
    return entry.value;
  }

  /** Read; under `'lru'` the entry becomes most-recent. */
  get(key: K): V | undefined {
    const value = this.peek(key);
    if (value === undefined) return undefined;
    if (this.policy === 'lru') {
      const entry = this.map.get(key);
      if (entry) {
        this.map.delete(key);
        this.map.set(key, entry);
      }
    }
    return value;
  }

  set(key: K, value: V, opts?: { ttlMs?: number }): void {
    const existing = this.map.get(key);
    if (existing) this.remove(key, existing, 'delete', false);
    const bytes = this.sizeOf ? this.sizeOf(value, key) : 0;
    const ttl = opts?.ttlMs ?? this.ttlMs;
    const entry: Entry<V> = { value, bytes, expiresAt: ttl === null || ttl === undefined ? null : this.now() + ttl };
    this.map.set(key, entry);
    this.totalBytes += bytes;
    this.enforce();
  }

  delete(key: K): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;
    this.remove(key, entry, 'delete');
    return true;
  }

  clear(): void {
    for (const [key, entry] of Array.from(this.map.entries())) this.remove(key, entry, 'clear');
  }

  /** Drop every expired entry. Returns how many were dropped. */
  sweep(): number {
    const now = this.now();
    let dropped = 0;
    for (const [key, entry] of Array.from(this.map.entries())) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.remove(key, entry, 'expired');
        dropped++;
      }
    }
    return dropped;
  }

  /** Evict oldest (fifo) or least recently used (lru) entries until `size <= n`. */
  trimTo(n: number): number {
    let dropped = 0;
    while (this.map.size > Math.max(0, Math.floor(n))) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      const entry = this.map.get(oldest.value);
      if (entry) this.remove(oldest.value, entry, 'trim');
      dropped++;
    }
    return dropped;
  }

  keys(): K[] {
    return Array.from(this.map.keys());
  }

  private enforce(): void {
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      const entry = this.map.get(oldest.value);
      if (entry) this.remove(oldest.value, entry, 'capacity');
    }
    if (this.maxBytes !== null) {
      // The newest entry is never evicted for bytes, even if it alone
      // exceeds the budget: a cache that refuses its only entry is useless,
      // and the next insert evicts it in turn.
      while (this.totalBytes > this.maxBytes && this.map.size > 1) {
        const oldest = this.map.keys().next();
        if (oldest.done) break;
        const entry = this.map.get(oldest.value);
        if (entry) this.remove(oldest.value, entry, 'bytes');
      }
    }
  }

  private remove(key: K, entry: Entry<V>, reason: EvictReason, notify = true): void {
    this.map.delete(key);
    this.totalBytes -= entry.bytes;
    if (notify && this.onEvict) this.onEvict(key, entry.value, reason);
  }
}

/** FIFO set of recent ids. Used for per-subscription event dedupe across re-issues. */
export class BoundedSet<T> {
  private readonly set = new Set<T>();

  constructor(private readonly max: number) {
    if (!(max >= 1)) throw new Error('BoundedSet: max must be >= 1');
  }

  get size(): number {
    return this.set.size;
  }

  has(value: T): boolean {
    return this.set.has(value);
  }

  /** Returns true if the value was new. */
  add(value: T): boolean {
    if (this.set.has(value)) return false;
    this.set.add(value);
    while (this.set.size > this.max) {
      const oldest = this.set.values().next();
      if (oldest.done) break;
      this.set.delete(oldest.value);
    }
    return true;
  }

  delete(value: T): boolean {
    return this.set.delete(value);
  }

  clear(): void {
    this.set.clear();
  }
}
