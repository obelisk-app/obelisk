/**
 * Web-of-Trust gating engine.
 *
 * The contract (see docs/architecture/data-system.md#web-of-trust-filtering):
 *   - `isAllowed(pubkey, kind?)` is synchronous. It is called from the bridge
 *     ingest hot path and must never await.
 *   - When WoT is enabled and the verdict for `pubkey` is unresolved, we
 *     fail-open AND enqueue `pubkey` for batch resolution. Later deny
 *     verdicts notify UI/policy listeners, but must not delete cached bridge
 *     data by themselves.
 *   - Mutes (union of NIP-51 + local zustand) override allow; blocks are a
 *     hard local denylist that also bypasses always-allow exemptions.
 *   - Always-allow kinds: own events, group metadata (39000), admins/members
 *     (39001/39002), group create (9007). Consensual DM exemption is
 *     evaluated via a caller-supplied predicate.
 *
 * The fixed policy (config, always-allow kinds, the batch-answer rule) lives
 * in `policy.ts`, the bounded TTL cache in `verdict-cache.ts` and the
 * one-at-a-time lookup queue in `batch-queue.ts`.
 */

import { registerRuntimeCache } from '@/services/local-data/runtime-caches';
import { wotBatch } from './extension';
import { BatchQueue } from './batch-queue';
import {
  batchVerdict,
  verdictsInvalidated,
  type BatchAnswer,
  type WotEngineConfig,
} from './policy';
import { ALWAYS_ALLOW_KINDS, DEFAULT_WOT_CONFIG } from '@/constants/wot/policy';
import { VerdictCache, type Verdict } from './verdict-cache';
import { DEFAULT_MAX_CACHE_ENTRIES, VERDICT_TTL_MS } from '@/constants/wot/verdict-cache';
import { WotEvents, type ChangeListener, type DenyListener, type WotEngineEvent } from './engine-events';

export type { WotEngineConfig } from './policy';
export type { WotEngineEvent } from './engine-events';

const BATCH_DEBOUNCE_MS = 100;

type BatchResult = Record<string, BatchAnswer> | null;

export class WotEngine {
  private readonly cache: VerdictCache;
  private readonly queue = new BatchQueue<BatchResult>(
    BATCH_DEBOUNCE_MS,
    (batch) => wotBatch(batch, this.cfg.maxHops, this.cfg.minPaths),
    (batch, result) => this.applyBatch(batch, result),
  );

  private cfg: WotEngineConfig = { ...DEFAULT_WOT_CONFIG };
  private ownPubkey: string | null = null;
  private mutedPubkeys = new Set<string>();
  private blockedPubkeys = new Set<string>();
  private isConsensualDm: (pubkey: string) => boolean = () => false;
  /**
   * Pubkeys that operate the relay(s) the user is currently browsing
   * (NIP-11 `pubkey` field). When the local user IS one of these, group-rail
   * filtering should treat every group on that relay as trusted: they own
   * the surface, hiding their own channels behind WoT is nonsense.
   */
  private operatorPubkeys = new Set<string>();
  private readonly events = new WotEvents();

  constructor(opts: { maxCacheEntries?: number } = {}) {
    this.cache = new VerdictCache(opts.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES);
  }

  configure(next: Partial<WotEngineConfig>): void {
    const prev = this.cfg;
    this.cfg = { ...prev, ...next };
    // Any config change invalidates verdicts: graph traversal depth or the
    // enable bit fundamentally change every prior answer.
    if (!verdictsInvalidated(prev, this.cfg)) return;
    this.clearVerdicts();
    // Fire on every config change (not just enable flip) so the bridge
    // re-evaluates known authors when maxHops changes too; otherwise
    // raising maxHops wouldn't re-admit previously-denied authors.
    this.events.fireEnabled(this.cfg.enabled);
  }

  /**
   * Subscribe to enable/disable transitions. Used by the bridge to
   * retroactively re-evaluate authors of already-cached events when WoT
   * gets toggled on after data is in the stores.
   */
  onEnabledChanged(cb: (enabled: boolean) => void): () => void {
    return this.events.onEnabledChanged(cb);
  }

  setOwnPubkey(pubkey: string | null): void {
    if (this.ownPubkey === pubkey) return;
    this.ownPubkey = pubkey;
    this.clearVerdicts();
  }

  setMutedPubkeys(list: ReadonlyArray<string>): void {
    const next = new Set(list);
    for (const pk of next) {
      if (!this.mutedPubkeys.has(pk)) this.events.fireDeny(pk);
    }
    this.mutedPubkeys = next;
    this.events.notifyChanged();
  }

  setBlockedPubkeys(list: ReadonlyArray<string>): void {
    const next = new Set(list);
    for (const pk of next) {
      if (!this.blockedPubkeys.has(pk)) this.events.fireDeny(pk);
    }
    this.blockedPubkeys = next;
    this.events.notifyChanged();
  }

  setConsensualDmPredicate(fn: (pubkey: string) => boolean): void {
    this.isConsensualDm = fn;
  }

  setOperatorPubkeys(list: ReadonlyArray<string>): void {
    this.operatorPubkeys = new Set(list);
    this.events.notifyChanged();
  }
  isOperator(pubkey: string): boolean {
    return this.operatorPubkeys.has(pubkey);
  }
  hasOperators(): boolean {
    return this.operatorPubkeys.size > 0;
  }

  /**
   * Sync gating predicate: the load-bearing function. Called from the
   * bridge `subscribeWatched.onevent` for every relay-derived event.
   */
  isAllowed(pubkey: string, kind?: number): boolean {
    // Block is the hard ceiling: bypasses every exemption.
    if (this.blockedPubkeys.has(pubkey)) return false;

    // Mutes apply unconditionally (NIP-51 + local).
    if (this.mutedPubkeys.has(pubkey)) return false;

    // Own events: always allow (they obviously won't be in our own WoT graph
    // as a non-self entry, and we sign them ourselves).
    if (this.ownPubkey && pubkey === this.ownPubkey) return true;

    // WoT off / not enabled / not configured → fail-open.
    if (!this.cfg.enabled) return true;

    // Always-allow kinds: group structure events. Without these we can't
    // render the group metadata or know who the admins/members are.
    if (typeof kind === 'number' && ALWAYS_ALLOW_KINDS.has(kind)) return true;

    // Consensual DM exemption: if we've already DM'd this pubkey, accept
    // their replies even without WoT membership.
    if (this.isConsensualDm(pubkey)) return true;

    const entry = this.cache.get(pubkey);
    if (!entry) {
      // Unresolved → fail-open; enqueue for batch resolution. A subsequent
      // deny verdict will prune anything we admitted in the meantime.
      this.markUnknown(pubkey);
      return true;
    }
    if (entry.expiresAt <= Date.now()) {
      // Lapsed → keep answering with the last verdict while a refresh is in
      // flight. Treating a lapsed entry as unresolved failed open, which
      // re-admitted every denied author for one batch window every TTL, with
      // no effort on their part; the refresh below is what lets a verdict
      // genuinely change.
      this.markUnknown(pubkey);
    }
    return entry.verdict === 'allow';
  }

  /**
   * `true` only when WoT is enabled AND we hold a resolved deny verdict
   * for `pubkey`. Use this to gate REQ-amplification (e.g. profile lookups):
   * unresolved verdicts must NOT block REQs because the verdict may
   * eventually resolve to allow.
   */
  isResolvedDeny(pubkey: string): boolean {
    if (!this.cfg.enabled) return false;
    if (this.blockedPubkeys.has(pubkey)) return true;
    if (this.mutedPubkeys.has(pubkey)) return true;
    // A lapsed deny is still the most recent evidence; `isAllowed` keeps
    // honouring it until the refresh lands, so the REQ gate agrees with it.
    const entry = this.cache.get(pubkey);
    if (!entry) return false;
    return entry.verdict === 'deny';
  }

  /**
   * Look up the cached distance for a pubkey, or `null` when unresolved.
   * Used by the WotBadge UI; does NOT enqueue a fresh lookup.
   */
  getDistance(pubkey: string): number | null {
    const entry = this.cache.get(pubkey);
    if (!entry || entry.expiresAt <= Date.now()) return null;
    if (entry.verdict !== 'allow') return null;
    return entry.distance;
  }

  /**
   * Enqueue a pubkey for batch verdict resolution. No-op if already cached
   * (and not expired) or already in-flight. Public so callers can warm
   * verdicts proactively (e.g. before painting a member list).
   */
  markUnknown(pubkey: string): void {
    if (!this.cfg.enabled) return;
    if (this.cache.isFresh(pubkey)) return;
    this.queue.add(pubkey);
  }

  private applyBatch(batch: string[], result: BatchResult): void {
    if (!result) {
      if (typeof console !== 'undefined') {
        console.warn('[wot] batch returned null: extension absent or rejected', { count: batch.length });
      }
      return;
    }
    const expiresAt = Date.now() + VERDICT_TTL_MS;
    this.cache.makeRoom(batch.length);
    let allow = 0;
    let deny = 0;
    for (const pk of batch) {
      const verdict = batchVerdict(result[pk], this.cfg);
      if (verdict.allow) {
        this.cache.set(pk, { verdict: 'allow', distance: verdict.distance, expiresAt });
        allow++;
      } else {
        this.cache.set(pk, { verdict: 'deny', distance: null, expiresAt });
        this.events.fireDeny(pk);
        deny++;
      }
    }
    if (typeof console !== 'undefined') {
      console.log('[wot] batch resolved', {
        total: batch.length, allow, deny,
        maxHops: this.cfg.maxHops, minPaths: this.cfg.minPaths,
      });
    }
    this.events.notifyChanged();
  }

  /**
   * Live counters for the diagnostic panel. Walks the cache once per call;
   * called from a UI component that already re-renders on `verdicts-changed`,
   * so the work stays bounded.
   */
  stats(): { allow: number; deny: number; pending: number } {
    return { ...this.cache.counts(), pending: this.queue.size };
  }

  /** Drop cached decisions and queued work without changing policy or listeners. */
  clearVerdicts(): void {
    this.cache.clear();
    // Drops the queue and disowns any batch already on the wire.
    this.queue.cancel();
    this.events.notifyChanged();
  }

  on(event: 'verdict-deny', cb: DenyListener): () => void;
  on(event: 'verdicts-changed', cb: ChangeListener): () => void;
  on(event: WotEngineEvent, cb: DenyListener | ChangeListener): () => void {
    if (event === 'verdict-deny') return this.events.onDeny(cb as DenyListener);
    return this.events.onChange(cb as ChangeListener);
  }

  // -- Test helpers -----------------------------------------------------
  /** @internal */
  _setVerdictForTest(pubkey: string, verdict: Verdict, distance: number | null = null): void {
    this.cache.set(pubkey, { verdict, distance, expiresAt: Date.now() + VERDICT_TTL_MS });
  }
  /** @internal */
  _flushForTest(): Promise<void> {
    return this.queue.flushNow();
  }
  /** @internal */
  _reset(): void {
    this.clearVerdicts();
    this.cfg = { ...DEFAULT_WOT_CONFIG };
    this.ownPubkey = null;
    this.mutedPubkeys = new Set();
    this.blockedPubkeys = new Set();
    this.isConsensualDm = () => false;
  }
}

export const wotEngine = new WotEngine();
registerRuntimeCache({
  id: 'wot-verdicts', category: 'profiles', scope: 'account', sensitive: true,
  inspect: () => { const stats = wotEngine.stats(); return { entries: stats.allow + stats.deny, pending: stats.pending }; },
  invalidate: () => wotEngine.clearVerdicts(),
});

/** Convenience export: the function reference is stable across configs. */
export function isAllowed(pubkey: string, kind?: number): boolean {
  return wotEngine.isAllowed(pubkey, kind);
}
