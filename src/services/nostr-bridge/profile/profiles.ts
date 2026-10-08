import type { ProfileEditOptions } from '@/types/session/profile';
/**
 * Profiles (kind 0): the batched lookup queue, the active-relay one-shot
 * REQ, the external lookup-relay query and the display-name fallback; the
 * signed-in user's own kind 0 (sync, edit) is `profile-own.ts`. Moved from
 * `client.ts` (round 4 plan, step 16) with the storage swap the RelayHub
 * design's step 8 asked for:
 *
 *  - `cache` is the hub's `ProfileCache` (DECISIONS §4): LRU 5,000, trimmed
 *    to 2,000 after the document has been hidden five minutes, plus the
 *    negative set. `userMetadata` stays the `StateStore` view the hooks and
 *    both shells read; it is derived from the cache, so an entry the LRU
 *    evicts leaves the view too (batched on a microtask, one store update
 *    per burst). The newest-wins stamp (`created_at`) rides the entry.
 *  - the companions that grew by one per pubkey ever seen are bounded with
 *    it: `requested` (a REQ was issued, FIFO 5,000: a pubkey it forgets
 *    costs one more REQ, never a lost profile), `lookupAt` (the external
 *    lookup's per-pubkey TTL stamp, FIFO 5,000), `inFlight` (transient, a
 *    batch at a time).
 *  - a lookup that completes with no kind 0 marks the pubkey missing for
 *    the cache's 30 min cooldown instead of stamping the 6 h TTL, so a
 *    missing profile is neither refetched on every render nor written off
 *    for the afternoon.
 *
 * `profiles.test.ts` pins the bound under 6,000 ingests, the hidden-tab
 * trim reaching the view, and the negative cooldown.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { KIND_METADATA } from '@/constants/nostr/nip-kinds';
import { BoundedMap, ProfileCache, type VisibilitySource } from '@nostr-wot/relay/hub';
import { wotEngine } from '@/services/wot/engine';
import { cacheGet, cacheSet } from '../cache/cache';
import type { BridgeContext } from '../facade/context';
import { userMetadataEqual } from '../groups/metadata/group-metadata';
import { OwnProfileModule, type EditUserMetadataOptions, type OwnProfileSyncReason } from './profile-own';
import { StateStore } from '../common/state-store';
import { ProfileBatcher } from './profile-batch';
import { ProfileLookup } from './profile-lookup';
import type { JsUserMetadata } from '../common/types';

export type ProfilesContext = Pick<
  BridgeContext,
  | 'session'
  | 'relays'
  | 'currentRelayUrl'
  | 'subscribeWatched'
  | 'track'
  | 'closeTracked'
  | 'queryRelaysWithConfidence'
  | 'queryAuthorsWithConfidence'
  | 'signAndPublish'
>;

export interface ProfilesDeps {
  /** Publish an already-signed event (the cached own kind 0) to the relays named. */
  publishSignedEventToRelays(ev: NostrEvent, relays: readonly string[]): Promise<string[]>;
}

export interface ProfilesOptions {
  readonly now?: () => number;
  /** Default: the document. `null` disables the hidden-tab trim. */
  readonly visibility?: VisibilitySource | null;
  readonly maxEntries?: number;
  readonly trimTo?: number;
  readonly hiddenTrimAfterMs?: number;
  readonly negativeCooldownMs?: number;
}

export type { EditUserMetadataOptions, OwnProfileSyncReason } from './profile-own';

interface ProfileEntry {
  readonly meta: JsUserMetadata;
  readonly createdAt: number;
}

/** Bound on the per-pubkey bookkeeping that is not the cache itself. */
const BOOKKEEPING_MAX = 5000;

export class ProfilesModule {
  /** The view the hooks and shells read; derived from {@link cache}. */
  readonly userMetadata = new StateStore<Record<string, JsUserMetadata>>({});
  private readonly cache: ProfileCache<ProfileEntry>;
  private readonly requested = new BoundedMap<string, true>({ maxEntries: BOOKKEEPING_MAX, policy: 'fifo' });
  private readonly lookup: ProfileLookup;
  private readonly batch: ProfileBatcher;
  /**
   * View changes waiting for the next flush: a profile to show, or `null` to
   * drop one. A burst of kind 0 events (a member list, a relay replaying
   * profiles) becomes one store update instead of one full copy of the view
   * per event, which made a 5,000-profile burst quadratic.
   */
  private readonly pendingView = new Map<string, JsUserMetadata | null>();
  private readonly now: () => number;
  private readonly own: OwnProfileModule;

  constructor(
    private readonly ctx: ProfilesContext,
    private readonly deps: ProfilesDeps,
    opts: ProfilesOptions = {},
  ) {
    this.now = opts.now ?? Date.now;
    this.cache = new ProfileCache<ProfileEntry>({
      now: this.now,
      visibility: opts.visibility,
      maxEntries: opts.maxEntries,
      trimTo: opts.trimTo,
      hiddenTrimAfterMs: opts.hiddenTrimAfterMs,
      negativeCooldownMs: opts.negativeCooldownMs,
      onEvict: (pubkey) => this.queueView(pubkey, null),
    });
    this.lookup = new ProfileLookup(ctx, {
      now: () => this.now(),
      isMissing: (pubkey) => this.cache.isMissing(pubkey),
      markMissing: (pubkey) => this.cache.markMissing(pubkey),
      ingest: (ev) => this.ingest(ev, { cacheRelayScoped: false }),
    }, BOOKKEEPING_MAX);
    this.batch = new ProfileBatcher(ctx, {
      ingest: (ev, cacheRelayScoped) => this.ingest(ev, { cacheRelayScoped }),
      lookupExternal: (authors) => this.lookupExternal(authors),
    });
    this.own = new OwnProfileModule(ctx, {
      ingest: (ev) => this.ingest(ev, { cacheRelayScoped: false }),
      ingestRelayScoped: (ev) => this.ingest(ev, { cacheRelayScoped: true }),
      lookupRelays: () => this.lookup.lookupRelays(),
      publishSignedEventToRelays: (ev, relays) => deps.publishSignedEventToRelays(ev, relays),
    });
  }

  /** Cache occupancy, for tests and the status panel. */
  stats(): { size: number; negative: number; trims: number } {
    return { size: this.cache.size, negative: this.cache.negativeSize, trims: this.cache.trims };
  }

  /**
   * Make sure `pubkey`'s profile is on its way. Reading it also marks it
   * recently used: a pubkey asked for is one on screen, which is the LRU's
   * recency signal.
   */
  ensure(pubkey: string): void {
    this.cache.get(pubkey);
    if (this.requested.has(pubkey)) return;
    // Skip the kind:0 REQ for resolved-deny pubkeys to avoid amplifying
    // unwanted authors into our outbound subscription set. Unknown verdicts
    // still get a REQ; they may resolve to allow later.
    if (wotEngine.isResolvedDeny(pubkey)) return;
    this.requested.set(pubkey, true);
    this.batch.queue(pubkey);
  }

  /** The pubkeys a session or relay reset should ask for again. */
  requestedPubkeys(): string[] {
    return this.requested.keys();
  }

  forgetRequested(): void {
    this.requested.clear();
  }

  /** Best-effort display name for OS popups; never blocks on a fetch. */
  displayNameFor(pubkey: string): string {
    const meta = this.cache.peek(pubkey)?.meta;
    return meta?.displayName || meta?.name || `${pubkey.slice(0, 8)}…`;
  }

  /**
   * Drop queued lookups. Used by the reset paths: the pubkeys are re-queued
   * from {@link requestedPubkeys} once the new REQs are up, and firing the
   * old batch would open REQs the reset is about to release.
   */
  clearPendingQueue(): void {
    this.batch.clear();
  }

  /**
   * Resolve kind 0 for `batch` against the profile-lookup relays, one
   * multi-author query per relay (`profile-lookup.ts`).
   */
  lookupExternal(batch: readonly string[]): Promise<void> {
    return this.lookup.lookup(batch);
  }

  dispose(): void {
    this.clearPendingQueue();
    this.pendingView.clear();
    this.cache.dispose();
  }

  ingest(ev: NostrEvent, opts: { cacheRelayScoped?: boolean } = { cacheRelayScoped: true }): void {
    const prevAt = this.cache.peek(ev.pubkey)?.createdAt ?? 0;
    if (ev.created_at <= prevAt) return;
    try {
      const data = JSON.parse(ev.content) as Record<string, unknown>;
      const meta: JsUserMetadata = {
        pubkey: ev.pubkey,
        name: (data.name as string) ?? null,
        displayName: (data.display_name as string) ?? null,
        picture: (data.picture as string) ?? null,
        about: (data.about as string) ?? null,
        nip05: (data.nip05 as string) ?? null,
        banner: (data.banner as string) ?? null,
        lud16: (data.lud16 as string) ?? null,
        website: (data.website as string) ?? null,
      };
      this.remember(ev.pubkey, meta, ev.created_at);
      // Skip the write when the cached profile already matches: kind 0
      // events are republished often (nip-05 verifier handshakes, profile
      // editor saves with the same fields, multi-relay re-broadcast) and
      // localStorage.setItem on a popular profile is a real cost.
      if (opts.cacheRelayScoped !== false) {
        const relay = this.ctx.currentRelayUrl.get();
        const cached = cacheGet<{ meta: JsUserMetadata; createdAt: number }>(relay, KIND_METADATA, ev.pubkey);
        if (!cached || !userMetadataEqual(cached.value.meta, meta)) {
          cacheSet(relay, KIND_METADATA, ev.pubkey, { meta, createdAt: ev.created_at });
        }
      }
    } catch {
      // ignore malformed kind:0 content
    }
  }

  /** Paint up to 500 cached profiles for `relay` at once; newest-wins against what is already held. */
  seedFromCache(relay: string, pubkeys: readonly string[]): void {
    for (const pubkey of pubkeys.slice(0, 500)) {
      const entry = cacheGet<{ meta: JsUserMetadata; createdAt: number }>(relay, KIND_METADATA, pubkey);
      if (!entry) continue;
      const { meta, createdAt } = entry.value;
      if ((this.cache.peek(pubkey)?.createdAt ?? 0) >= createdAt) continue;
      this.cache.set(pubkey, { meta, createdAt });
      this.queueView(pubkey, meta);
    }
  }

  /** The signed-in user's own kind 0: see `profile-own.ts`. */
  edit(opts: EditUserMetadataOptions, options: ProfileEditOptions = {}): Promise<void> {
    return this.own.edit(opts, options);
  }

  syncOwn(reason: OwnProfileSyncReason): Promise<void> {
    return this.own.sync(reason);
  }

  // ---- internals ------------------------------------------------------------

  private remember(pubkey: string, meta: JsUserMetadata, createdAt: number): void {
    this.cache.set(pubkey, { meta, createdAt });
    this.queueView(pubkey, meta);
  }

  /** Queue one view change; the first in a burst schedules the flush. */
  private queueView(pubkey: string, meta: JsUserMetadata | null): void {
    const first = this.pendingView.size === 0;
    this.pendingView.set(pubkey, meta);
    if (first) queueMicrotask(() => this.flushView());
  }

  private flushView(): void {
    if (this.pendingView.size === 0) return;
    const changes = Array.from(this.pendingView);
    this.pendingView.clear();
    this.userMetadata.update((prev) => {
      const next = { ...prev };
      for (const [pubkey, meta] of changes) {
        if (meta) next[pubkey] = meta;
        else delete next[pubkey];
      }
      return next;
    });
  }
}
