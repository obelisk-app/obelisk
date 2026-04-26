/**
 * Browser-side request coalescer for Nostr relay reads.
 *
 * Acts as an observer pattern: every consumer (DM session, profile cache,
 * relay-list cache, follows, profile editor, follower lists, …) `enqueue`s
 * its filters/relays/handlers onto the SAME instance. Within a 50ms window,
 * all enqueues with the same sorted relay-set are merged into a single
 * `pool.subscribeMany` REQ. Events fan out to every consumer whose handle
 * is still active. When the last handle on a sub is closed, the underlying
 * subscription is torn down (events stop on the wire).
 *
 * Two consumer shapes:
 * - `enqueue(req)` — event-stream / live subscription. Returns a teardown.
 * - `querySync(filters, relays, opts)` — Promise<Event[]>. Wraps `enqueue`,
 *   collects events, resolves on EOSE-from-all-relays or the timeout.
 */

import type { Event as NostrEvent } from 'nostr-tools/pure';
import type { Filter } from 'nostr-tools/filter';
import { getNostrPool, verifyNostrEvent } from './nostr-pool';

export interface CoalescerEnqueue {
  filters: Filter[];
  relays: string[];
  onEvent: (event: NostrEvent) => void;
  onEose?: (relay: string) => void;
}

export interface CoalescerOptions {
  debounceMs?: number;
  subscriptionTimeoutMs?: number;
}

export interface QuerySyncOptions {
  relays: string[];
  /** Hard ceiling on how long to wait for events. Default 8000ms. */
  timeoutMs?: number;
}

interface EntryHandle {
  req: CoalescerEnqueue;
  group: PendingGroup | null;
  active: ActiveSub | null;
}

interface PendingGroup {
  relayKey: string;
  relays: string[];
  entries: EntryHandle[];
}

interface ActiveSub {
  sub: { close: () => void };
  entries: EntryHandle[];
  closed: boolean;
}

export class RequestCoalescer {
  private debounceMs: number;
  private subscriptionTimeoutMs: number;
  private pending: Map<string, PendingGroup> = new Map();
  private active: Set<ActiveSub> = new Set();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: CoalescerOptions = {}) {
    this.debounceMs = opts.debounceMs ?? 50;
    this.subscriptionTimeoutMs = opts.subscriptionTimeoutMs ?? 5000;
  }

  /**
   * Add an entry to the next debounce window. Returns a closer that removes
   * the entry from its group. Calling it before flush prevents the entry's
   * filters from being included in the REQ. Calling it after flush removes
   * the entry from the active sub; when the last entry is removed, the
   * underlying SimplePool subscription is closed.
   *
   * Idempotent: calling the closer twice is safe.
   */
  enqueue(req: CoalescerEnqueue): () => void {
    const relayKey = [...req.relays].sort().join('|');
    let group = this.pending.get(relayKey);
    if (!group) {
      group = { relayKey, relays: [...req.relays].sort(), entries: [] };
      this.pending.set(relayKey, group);
    }
    const handle: EntryHandle = { req, group, active: null };
    group.entries.push(handle);

    if (this.timer === null) {
      this.timer = setTimeout(() => this.flush(), this.debounceMs);
    }

    return () => this.closeEntry(handle);
  }

  /**
   * Promise-shaped one-shot fetch. Routes through `enqueue` so the request
   * coalesces with concurrent live subscriptions and other one-shot fetches
   * within the same debounce window. Resolves with the verified events
   * collected before EOSE-from-all-relays or the timeout. Drops events with
   * bad signatures (delegated to the shared verify gate).
   */
  querySync(filters: Filter[], opts: QuerySyncOptions): Promise<NostrEvent[]> {
    const timeoutMs = opts.timeoutMs ?? 8000;
    return new Promise((resolve) => {
      const events: NostrEvent[] = [];
      const seen = new Set<string>();
      const eosedRelays = new Set<string>();
      let settled = false;
      let close: () => void = () => {};

      const finish = () => {
        if (settled) return;
        settled = true;
        try { close(); } catch { /* ignore */ }
        clearTimeout(timer);
        resolve(events);
      };

      const timer = setTimeout(finish, timeoutMs);

      close = this.enqueue({
        filters,
        relays: opts.relays,
        onEvent: (event) => {
          if (seen.has(event.id)) return;
          seen.add(event.id);
          events.push(event);
        },
        onEose: (relay) => {
          eosedRelays.add(relay);
          if (eosedRelays.size >= opts.relays.length) finish();
        },
      });
    });
  }

  private closeEntry(handle: EntryHandle): void {
    if (handle.group) {
      const idx = handle.group.entries.indexOf(handle);
      if (idx !== -1) handle.group.entries.splice(idx, 1);
      if (handle.group.entries.length === 0) {
        this.pending.delete(handle.group.relayKey);
        if (this.pending.size === 0 && this.timer !== null) {
          clearTimeout(this.timer);
          this.timer = null;
        }
      }
      handle.group = null;
    }

    if (handle.active && !handle.active.closed) {
      const a = handle.active;
      const idx = a.entries.indexOf(handle);
      if (idx !== -1) a.entries.splice(idx, 1);
      if (a.entries.length === 0) {
        a.closed = true;
        try { a.sub.close(); } catch { /* ignore */ }
        this.active.delete(a);
      }
      handle.active = null;
    }
  }

  private flush(): void {
    this.timer = null;
    const groups = Array.from(this.pending.values());
    this.pending.clear();
    for (const g of groups) this.fire(g);
  }

  private fire(g: PendingGroup): void {
    const seen = new Set<string>();
    const handles = g.entries.slice();
    if (handles.length === 0) return;
    const filters = handles.flatMap((h) => h.req.filters);
    const pool = getNostrPool();
    const active: ActiveSub = { sub: null!, entries: handles, closed: false };

    // nostr-tools' .d.ts types `subscribeMany`'s second arg as a single Filter,
    // but the runtime accepts Filter[] (Nostr REQs are spec'd to allow multiple
    // filters per subscription). Cast to satisfy the .d.ts.
    active.sub = pool.subscribeMany(g.relays, filters as unknown as Filter, {
      onevent: (event: NostrEvent) => {
        if (seen.has(event.id)) return;
        seen.add(event.id);
        if (!verifyNostrEvent(event)) return;
        for (const h of active.entries) h.req.onEvent(event);
      },
      // nostr-tools' .d.ts types `oneose` as `() => void`, but at runtime
      // it's invoked once per relay with the relay URL. Cast here to satisfy
      // the .d.ts.
      oneose: ((relay: string) => {
        for (const h of active.entries) h.req.onEose?.(relay);
      }) as () => void,
    });

    for (const h of handles) {
      h.group = null;
      h.active = active;
    }
    this.active.add(active);

    if (this.subscriptionTimeoutMs > 0) {
      setTimeout(() => {
        if (active.closed) return;
        active.closed = true;
        try { active.sub.close(); } catch { /* ignore */ }
        for (const h of active.entries) h.active = null;
        this.active.delete(active);
      }, this.subscriptionTimeoutMs);
    }
  }

  /** Test/teardown helper — drops pending + active state. Does NOT close
   *  the underlying pool (callers manage pool lifecycle separately). */
  _reset(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (const a of this.active) {
      try { a.sub.close(); } catch { /* ignore */ }
    }
    this.active.clear();
    this.pending.clear();
  }
}

/**
 * The shared singleton. Every consumer should import this rather than
 * constructing its own instance — that's what makes the coalescer's
 * cross-module batching actually fire.
 */
export const sharedCoalescer = new RequestCoalescer({ debounceMs: 50 });
