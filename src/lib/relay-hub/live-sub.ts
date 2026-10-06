/**
 * The registry's per-REQ record (`LiveSub`) and the small operations on one
 * record or one socket's bucket of them that need no registry state:
 * ordering, status fan-out, timer and wire teardown, holder merging, and
 * the resume filters a re-issue sends.
 */
import type { Filter } from 'nostr-tools';
import type { RelayUrl, SubPriority, SubStatus, SubscribeSpec, SubscriptionLike } from './types';
import type { SocketEntry } from './sockets';
import { BoundedSet } from './bounded-map';
import { PRIORITY_RANK } from './env';

export interface Holder {
  readonly spec: SubscribeSpec;
  priority: SubPriority;
}

export interface IssuedRef {
  sub: SubscriptionLike | null;
}

export interface LiveSub {
  readonly key: string;
  readonly url: RelayUrl;
  readonly entry: SocketEntry;
  readonly filters: Filter[];
  priority: SubPriority;
  readonly seq: number;
  readonly holders: Set<Holder>;
  status: SubStatus;
  issued: { generation: number; ref: IssuedRef } | null;
  /** Issues on the current generation without an event in between. */
  attempt: number;
  lastEventAt: number;
  firstGeneration: number;
  /** Event ids delivered, FIFO 2,000: dedupe across re-issues on the same relay. 2,000 × (80 B id + 40 B Set entry) ≈ 240 KB per sub worst case. */
  readonly seen: BoundedSet<string>;
  retryTimer: ReturnType<typeof setTimeout> | null;
  /** Shortest `watchdogMs` among the holders, or null for none. */
  watchdogMs: number | null;
  watchdogTimer: ReturnType<typeof setTimeout> | null;
  /** Largest `maxAttempts` among the holders. */
  maxAttempts: number;
  terminalReason: string | null;
}

/** One socket's subs and its current REQ budget. */
export interface Bucket {
  readonly subs: Map<string, LiveSub>;
  max: number;
  penaltyTimer: ReturnType<typeof setTimeout> | null;
}

export const SEEN_IDS_PER_SUB = 2000;

export function createLiveSub(key: string, entry: SocketEntry, filters: Filter[], priority: SubPriority, seq: number): LiveSub {
  return {
    key,
    url: entry.url,
    entry,
    filters,
    priority,
    seq,
    holders: new Set(),
    status: 'pending',
    issued: null,
    attempt: 0,
    lastEventAt: 0,
    firstGeneration: 0,
    seen: new BoundedSet<string>(SEEN_IDS_PER_SUB),
    retryTimer: null,
    watchdogMs: null,
    watchdogTimer: null,
    maxAttempts: Infinity,
    terminalReason: null,
  };
}

export function rank(p: SubPriority): number {
  return PRIORITY_RANK[p];
}

/** Highest priority first, then oldest first. */
export function byPriority(a: LiveSub, b: LiveSub): number {
  const d = rank(b.priority) - rank(a.priority);
  return d !== 0 ? d : a.seq - b.seq;
}

/** The open sub to shed first: lowest priority, newest inside a class. */
export function lowestOpen(bucket: Bucket): LiveSub | null {
  let lowest: LiveSub | null = null;
  for (const other of bucket.subs.values()) {
    if (!other.issued) continue;
    if (!lowest || rank(other.priority) < rank(lowest.priority) || (rank(other.priority) === rank(lowest.priority) && other.seq > lowest.seq)) {
      lowest = other;
    }
  }
  return lowest;
}

/** REQ slots currently on the wire. */
export function usedSlots(bucket: Bucket): number {
  let used = 0;
  for (const live of bucket.subs.values()) if (live.issued) used += 1;
  return used;
}

export function setStatus(live: LiveSub, status: SubStatus): void {
  if (live.status === status) return;
  live.status = status;
  for (const holder of Array.from(live.holders)) holder.spec.onStatus?.(status, live.url);
}

export function recomputePriority(live: LiveSub): void {
  let best: SubPriority = 'background';
  for (const holder of live.holders) if (rank(holder.priority) > rank(best)) best = holder.priority;
  live.priority = best;
}

/** A new holder can only shorten the watchdog, raise the attempt cap and raise the priority. */
export function adoptHolderSettings(live: LiveSub, holder: Holder): void {
  const { watchdogMs } = holder.spec;
  const cap = holder.spec.maxAttempts ?? Infinity;
  if (watchdogMs !== undefined && (live.watchdogMs === null || watchdogMs < live.watchdogMs)) live.watchdogMs = watchdogMs;
  live.maxAttempts = live.holders.size === 1 ? cap : Math.max(live.maxAttempts, cap);
  recomputePriority(live);
}

export function clearRetry(live: LiveSub): void {
  if (live.retryTimer) {
    clearTimeout(live.retryTimer);
    live.retryTimer = null;
  }
}

export function clearWatchdog(live: LiveSub): void {
  if (live.watchdogTimer) {
    clearTimeout(live.watchdogTimer);
    live.watchdogTimer = null;
  }
}

/** Close the wire REQ without treating its `onclose` as a verdict. */
export function closeWire(live: LiveSub): void {
  const issued = live.issued;
  if (!issued) return;
  live.issued = null;
  try {
    issued.ref.sub?.close();
  } catch {
    // The socket is already gone; nostr-tools swallows this too.
  }
}

/** The sub's filters, with `since` advanced past the last event once the socket has reconnected. */
export function resumeFilters(live: LiveSub, generation: number): Filter[] {
  const advance = live.lastEventAt > 0 && generation !== live.firstGeneration;
  return live.filters.map((f) => {
    const copy: Filter = { ...f };
    if (advance && copy.until === undefined) copy.since = Math.max(copy.since ?? 0, live.lastEventAt + 1);
    return copy;
  });
}
