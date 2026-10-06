/**
 * The wire half of the subscription registry: per-socket REQ budgets, and
 * everything that happens to one `LiveSub` once it exists. It issues a REQ
 * (with resume filters), parks and unparks against the budget, runs the
 * silence watchdog, reads every relay CLOSED and decides retry, park or
 * terminate. `SubscriptionRegistry` owns who holds what; this owns when and
 * whether it is on the wire. The policy itself is documented on
 * `registry.ts`.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import type { BackoffPolicy } from './types';
import type { SocketEntry } from './sockets';
import type { AuthLayer } from './auth';
import { classifyClosedReason } from './closed-reason';
import { SYNTHETIC_EOSE_MARGIN_MS } from './env';
import {
  byPriority,
  clearRetry,
  clearWatchdog,
  closeWire,
  lowestOpen,
  rank,
  resumeFilters,
  setStatus,
  usedSlots,
  type Bucket,
  type IssuedRef,
  type LiveSub,
} from './live-sub';

export interface RegistryOptions {
  readonly maxSubsPerSocket: number;
  readonly backoff: BackoffPolicy;
  /** Retries for an unclassified relay CLOSED before `onClosed`. Default 3. */
  readonly closedRetryAttempts: number;
  /** How long a quota CLOSED lowers the socket budget. Default 60_000. */
  readonly quotaPenaltyMs: number;
}

export class SubScheduler {
  /** One bucket per socket key. */
  readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly auth: AuthLayer,
    private readonly opts: RegistryOptions,
  ) {}

  bucket(entry: SocketEntry): Bucket {
    let bucket = this.buckets.get(entry.key);
    if (!bucket) {
      bucket = { subs: new Map(), max: this.opts.maxSubsPerSocket, penaltyTimer: null };
      this.buckets.set(entry.key, bucket);
    }
    return bucket;
  }

  /** Drop a socket's bucket and its quota penalty. */
  forget(key: string): void {
    const bucket = this.buckets.get(key);
    if (bucket?.penaltyTimer) clearTimeout(bucket.penaltyTimer);
    this.buckets.delete(key);
  }

  terminate(live: LiveSub, reason: string): void {
    if (live.terminalReason !== null) return;
    clearRetry(live);
    clearWatchdog(live);
    closeWire(live);
    live.terminalReason = reason;
    setStatus(live, 'closed');
    for (const holder of Array.from(live.holders)) holder.spec.onClosed?.(live.url, reason);
    const bucket = this.buckets.get(live.entry.key);
    if (bucket) this.unparkOne(bucket);
  }

  tryIssue(live: LiveSub): void {
    if (live.terminalReason !== null || live.issued) return;
    const entry = live.entry;
    if (entry.connection !== 'connected') {
      setStatus(live, 'pending');
      return;
    }
    const bucket = this.bucket(entry);
    if (usedSlots(bucket) < bucket.max) {
      this.issue(live);
      return;
    }
    // Full: park the lowest open sub if it ranks below this one.
    const victim = lowestOpen(bucket);
    if (victim && rank(victim.priority) < rank(live.priority)) {
      this.park(victim);
      this.issue(live);
    } else {
      setStatus(live, 'parked');
    }
  }

  unparkOne(bucket: Bucket): void {
    const parked = Array.from(bucket.subs.values())
      .filter((l) => l.status === 'parked' && l.terminalReason === null && !l.issued)
      .sort(byPriority);
    const next = parked[0];
    if (next) this.tryIssue(next);
  }

  private park(live: LiveSub): void {
    clearRetry(live);
    clearWatchdog(live);
    closeWire(live);
    setStatus(live, 'parked');
  }

  private issue(live: LiveSub): void {
    const entry = live.entry;
    if (live.firstGeneration === 0) live.firstGeneration = entry.generation;
    const filters = resumeFilters(live, entry.generation);
    live.attempt += 1;
    const ref: IssuedRef = { sub: null };
    live.issued = { generation: entry.generation, ref };
    const label = Array.from(live.holders).find((h) => h.spec.label)?.spec.label;
    const sub = entry.relay.subscribe(filters, {
      onevent: (ev) => this.onEvent(live, ref, ev),
      oneose: () => this.onEose(live, ref),
      onclose: (reason) => this.onClosed(live, ref, reason),
      alreadyHaveEvent: (id) => live.seen.has(id),
      eoseTimeout: live.watchdogMs === null ? undefined : live.watchdogMs + SYNTHETIC_EOSE_MARGIN_MS,
      label,
    });
    ref.sub = sub;
    this.armWatchdog(live);
    setStatus(live, 'open');
  }

  private armWatchdog(live: LiveSub): void {
    clearWatchdog(live);
    if (live.watchdogMs === null) return;
    live.watchdogTimer = setTimeout(() => {
      live.watchdogTimer = null;
      this.onWatchdog(live);
    }, live.watchdogMs);
  }

  /**
   * No EVENT and no EOSE since the REQ was issued. A human may be staring
   * at the signer prompt for this socket: nostr-tools re-fires the REQ once
   * the AUTH lands, so killing it now would cost a second prompt. Otherwise
   * the REQ is dead: close it and re-issue with backoff.
   */
  private onWatchdog(live: LiveSub): void {
    if (live.terminalReason !== null || !live.issued) return;
    const record = this.auth.recordFor(live.entry);
    if (record && (record.state === 'signing' || record.state === 'challenged')) {
      this.armWatchdog(live);
      return;
    }
    closeWire(live);
    this.scheduleRetry(live, false);
  }

  private isCurrent(live: LiveSub, ref: IssuedRef): boolean {
    return live.issued !== null && live.issued.ref === ref;
  }

  private onEvent(live: LiveSub, ref: IssuedRef, ev: NostrEvent): void {
    if (!this.isCurrent(live, ref)) return;
    if (!live.seen.add(ev.id)) return;
    if (ev.created_at > live.lastEventAt) live.lastEventAt = ev.created_at;
    live.attempt = 0;
    clearWatchdog(live);
    for (const holder of Array.from(live.holders)) holder.spec.onEvent(ev, live.url);
  }

  private onEose(live: LiveSub, ref: IssuedRef): void {
    if (!this.isCurrent(live, ref)) return;
    // EOSE proves the REQ is live even when the relay has nothing stored.
    // It does not reset `attempt`: auth-gated relays send an empty EOSE
    // just before CLOSED `auth-required:`, and that CLOSED must still count.
    clearWatchdog(live);
    setStatus(live, 'eose');
    for (const holder of Array.from(live.holders)) holder.spec.onEose?.(live.url);
  }

  private onClosed(live: LiveSub, ref: IssuedRef, reason: string): void {
    if (!this.isCurrent(live, ref)) return;
    // The relay ended this issue; drop our handle on it the same way we do
    // when we end one (nostr-tools sends nothing for a REQ it already
    // marked closed, and the pool-level fakes forget it only on close).
    closeWire(live);
    clearWatchdog(live);
    const entry = live.entry;
    if (entry.connection !== 'connected') {
      // Transport: the socket table already scheduled the reconnect.
      setStatus(live, 'pending');
      return;
    }
    for (const holder of Array.from(live.holders)) holder.spec.onRelayClosed?.(live.url, reason);
    // A holder that released inside the verdict callback took the REQ with it.
    if (live.holders.size === 0 || live.terminalReason !== null) return;
    switch (classifyClosedReason(reason)) {
      case 'auth':
        this.onAuthClosed(live, reason);
        return;
      case 'restricted':
        this.terminate(live, reason);
        return;
      case 'quota':
        this.quotaHit(live);
        return;
      case 'other':
        if (live.attempt >= this.opts.closedRetryAttempts) {
          this.terminate(live, reason);
          return;
        }
        this.scheduleRetry(live, false);
    }
  }

  private onAuthClosed(live: LiveSub, reason: string): void {
    const entry = live.entry;
    const record = this.auth.recordFor(entry);
    if (!entry.relay.onauth || record?.state === 'refused') {
      this.terminate(live, reason);
      return;
    }
    if (record && (record.state === 'signing' || record.state === 'challenged') && record.verdict) {
      // Ride the prompt that is already open; re-issue when the relay answers.
      const verdict = record.verdict;
      setStatus(live, 'pending');
      void verdict.then((ok) => {
        if (live.issued || live.terminalReason !== null || live.holders.size === 0) return;
        if (ok) this.tryIssue(live);
        else this.terminate(live, reason);
      });
      return;
    }
    this.scheduleRetry(live, live.attempt <= 1);
  }

  private scheduleRetry(live: LiveSub, immediate: boolean): void {
    clearRetry(live);
    if (live.attempt >= live.maxAttempts) {
      this.terminate(live, `hub: gave up after ${live.attempt} attempt${live.attempt === 1 ? '' : 's'}`);
      return;
    }
    setStatus(live, 'pending');
    const { baseMs, maxMs } = this.opts.backoff;
    const delay = immediate ? 0 : Math.min(baseMs * 2 ** Math.max(0, live.attempt - 1), maxMs);
    live.retryTimer = setTimeout(() => {
      live.retryTimer = null;
      this.tryIssue(live);
    }, delay);
  }

  private quotaHit(live: LiveSub): void {
    const bucket = this.bucket(live.entry);
    bucket.max = Math.max(1, bucket.max - 1);
    if (bucket.penaltyTimer) clearTimeout(bucket.penaltyTimer);
    bucket.penaltyTimer = setTimeout(() => {
      bucket.penaltyTimer = null;
      bucket.max = this.opts.maxSubsPerSocket;
      this.unparkOne(bucket);
    }, this.opts.quotaPenaltyMs);
    this.park(live);
    // The relay says we hold too many; shed the lowest open one too so the
    // count actually goes down, not just this REQ.
    const lowest = lowestOpen(bucket);
    if (lowest && usedSlots(bucket) > bucket.max) this.park(lowest);
  }
}
