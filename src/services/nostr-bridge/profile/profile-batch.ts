/**
 * The batched kind 0 REQ: pubkeys asked for within one frame go out as one
 * bounded REQ on the active relay (100 authors at most), with the cached
 * kind 0 painted at once and the lookup relays queried alongside. Pure move
 * from `profiles.ts`.
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { KIND_METADATA } from '@/utils/nostr/nip-kinds';
import type { BridgeContext, TrackedSub } from '../facade/context';
import { cachedKind0ToEvent, getCachedKind0 } from './profile-sync-cache';

/** Authors per batched kind 0 REQ: a big member list is a few REQs, the filter stays inside relay frame sizes. */
const KIND0_BATCH_SIZE = 100;
/** One frame's worth: long enough to coalesce a member list arriving as one ingest, short enough that avatars paint at once. */
const KIND0_BATCH_DELAY_MS = 16;

export type ProfileBatchContext = Pick<BridgeContext, 'relays' | 'subscribeWatched' | 'track' | 'closeTracked'>;

export interface ProfileBatchDeps {
  /** Ingest a kind 0; `cacheRelayScoped` writes it to the active relay's cache too. */
  ingest(ev: NostrEvent, cacheRelayScoped: boolean): void;
  lookupExternal(batch: readonly string[]): Promise<void>;
}

export class ProfileBatcher {
  private pending: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly ctx: ProfileBatchContext,
    private readonly deps: ProfileBatchDeps,
  ) {}

  /**
   * Drop queued lookups. Used by the reset paths: the pubkeys are re-queued
   * from `requestedPubkeys` once the new REQs are up, and firing the
   * old batch would open REQs the reset is about to release.
   */
  clear(): void {
    this.pending = [];
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Add `pubkey` to the next batched kind 0 REQ; a full batch goes out at once. */
  queue(pubkey: string): void {
    this.pending.push(pubkey);
    if (this.pending.length >= KIND0_BATCH_SIZE) {
      this.flush();
      return;
    }
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, KIND0_BATCH_DELAY_MS);
  }

  private flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    while (this.pending.length > 0) this.subscribeBatch(this.pending.splice(0, KIND0_BATCH_SIZE));
  }

  /** One bounded REQ on the active relay covering every pubkey in `batch`; the lookup relays are queried alongside. */
  private subscribeBatch(batch: readonly string[]): void {
    const authors = Array.from(new Set(batch));
    if (authors.length === 0) return;
    const filter: Filter = { kinds: [KIND_METADATA], authors };
    // `let`, not `const`: `oneose` can fire inside the call that assigns `sub`.
    let sub: TrackedSub | undefined;
    // eslint-disable-next-line prefer-const
    sub = this.ctx.subscribeWatched(
      this.ctx.relays(),
      filter,
      (ev) => this.deps.ingest(ev, true),
      () => {
        if (sub) this.ctx.closeTracked(sub);
      },
      { watchdogMs: 3000, maxAttempts: 2, affectsRelayAccess: false },
    );
    this.ctx.track(sub);
    for (const pubkey of authors) {
      const cached = getCachedKind0(pubkey);
      if (cached) this.deps.ingest(cachedKind0ToEvent(cached), false);
    }
    void this.deps.lookupExternal(authors);
  }
}
