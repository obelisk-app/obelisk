import type { Event as NostrEvent } from 'nostr-tools/pure';
import type { Filter } from 'nostr-tools/filter';
import { getDMPool, verifyDMEvent } from './pool';

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

// Each enqueue produces an EntryHandle that lives on the pending group until
// flush, then migrates onto the active sub. The handle is the unit the closer
// removes — when the last entry on an active sub is closed, we tear down the
// underlying SimplePool subscription (no more events flowing on the wire).
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

  private closeEntry(handle: EntryHandle): void {
    // Pending case: still in a group waiting to flush.
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

    // Active case: already firing.
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
    const pool = getDMPool();
    const active: ActiveSub = { sub: null!, entries: handles, closed: false };

    // nostr-tools' .d.ts types `subscribeMany`'s second arg as a single Filter,
    // but the runtime accepts Filter[] (Nostr REQs are spec'd to allow multiple
    // filters per subscription). Cast to satisfy the .d.ts.
    active.sub = pool.subscribeMany(g.relays, filters as unknown as Filter, {
      onevent: (event: NostrEvent) => {
        if (seen.has(event.id)) return;
        seen.add(event.id);
        if (!verifyDMEvent(event)) return;
        for (const h of active.entries) h.req.onEvent(event);
      },
      // nostr-tools' .d.ts types `oneose` as `() => void`, but at runtime
      // it's invoked once per relay with the relay URL. We expose the URL to
      // consumers since it's load-bearing for relay attribution; cast here
      // to satisfy the .d.ts. If the upstream types are tightened later,
      // consumers can drop the relay arg from their handler.
      oneose: ((relay: string) => {
        for (const h of active.entries) h.req.onEose?.(relay);
      }) as () => void,
    });

    // Migrate handles onto the active sub.
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
}
