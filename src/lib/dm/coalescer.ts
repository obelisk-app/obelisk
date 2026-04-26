import type { Filter, Event as NostrEvent } from 'nostr-tools/pure';
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
    const sub = pool.subscribeMany(g.relays, filters, {
      onevent: (event: NostrEvent) => {
        if (seen.has(event.id)) return;
        seen.add(event.id);
        if (!verifyDMEvent(event)) return;
        for (const e of g.entries) e.onEvent(event);
      },
      oneose: (relay: string) => {
        for (const e of g.entries) e.onEose?.(relay);
      },
    });

    if (this.subscriptionTimeoutMs > 0) {
      setTimeout(() => {
        try { sub.close(); } catch { /* ignore */ }
      }, this.subscriptionTimeoutMs);
    }
  }
}
