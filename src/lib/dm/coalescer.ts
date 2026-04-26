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

interface PendingGroup {
  relayKey: string;
  relays: string[];
  entries: CoalescerEnqueue[];
}

export class RequestCoalescer {
  private debounceMs: number;
  private subscriptionTimeoutMs: number;
  private pending: Map<string, PendingGroup> = new Map();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: CoalescerOptions = {}) {
    this.debounceMs = opts.debounceMs ?? 50;
    this.subscriptionTimeoutMs = opts.subscriptionTimeoutMs ?? 5000;
  }

  enqueue(req: CoalescerEnqueue): void {
    const relayKey = [...req.relays].sort().join('|');
    let group = this.pending.get(relayKey);
    if (!group) {
      group = { relayKey, relays: [...req.relays].sort(), entries: [] };
      this.pending.set(relayKey, group);
    }
    group.entries.push(req);
    if (this.timer === null) {
      this.timer = setTimeout(() => this.flush(), this.debounceMs);
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
    const filters = g.entries.flatMap((e) => e.filters);
    const pool = getDMPool();
    // nostr-tools' .d.ts types `subscribeMany`'s second arg as a single Filter,
    // but the runtime accepts Filter[] (Nostr REQs are spec'd to allow multiple
    // filters per subscription). Cast to satisfy the .d.ts.
    const sub = pool.subscribeMany(g.relays, filters as unknown as Filter, {
      onevent: (event: NostrEvent) => {
        if (seen.has(event.id)) return;
        seen.add(event.id);
        if (!verifyDMEvent(event)) return;
        for (const e of g.entries) e.onEvent(event);
      },
      // nostr-tools' .d.ts types `oneose` as `() => void`, but at runtime
      // it's invoked once per relay with the relay URL. We expose the URL to
      // consumers since it's load-bearing for relay attribution; cast here
      // to satisfy the .d.ts. If the upstream types are tightened later,
      // consumers can drop the relay arg from their handler.
      oneose: ((relay: string) => {
        for (const e of g.entries) e.onEose?.(relay);
      }) as () => void,
    });

    if (this.subscriptionTimeoutMs > 0) {
      setTimeout(() => {
        try { sub.close(); } catch { /* ignore */ }
      }, this.subscriptionTimeoutMs);
    }
  }
}
