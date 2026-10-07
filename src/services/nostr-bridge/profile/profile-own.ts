/**
 * The signed-in user's own kind 0 (round 4 plan, step 16; split from
 * `profiles.ts` for size): the editor behind `bridge.editUserMetadata`,
 * and the sync that keeps the newest revision from the lookup relays
 * published on the relay being browsed (`syncOwnProfileToActiveRelay` in
 * the old facade). Lookup and sync stamps live in `profile-sync-cache.ts`
 * (localStorage); the in-memory profile state is `profiles.ts`, reached
 * through `deps.ingest`.
 */
import { CodedError } from '@/utils/errors/codes';
import type { Event as NostrEvent } from 'nostr-tools';
import { KIND_METADATA } from '@/constants/nostr/nip-kinds';
import type { BridgeContext } from '../facade/context';
import {
  cachedKind0ToEvent,
  getCachedKind0,
  loadProfileSyncState,
  newestEvent,
  profileRelayKey,
  saveProfileSyncState,
  setCachedKind0,
  toCachedKind0,
} from './profile-sync-cache';
import { DEFAULT_PROFILE_LOOKUP_RELAYS, OWN_PROFILE_LOOKUP_TTL_MS, PROFILE_LOOKUP_MAX_WAIT_MS } from '@/constants/nostr-bridge/profile';
import { uniqueRelayUrls } from '../relay/relay-list';

export type OwnProfileContext = Pick<BridgeContext, 'session' | 'relays' | 'currentRelayUrl' | 'queryRelaysWithConfidence' | 'signAndPublish'>;

export interface OwnProfileDeps {
  /** Fold a kind 0 found on the lookup relays into the profile state (not relay-scoped on disk). */
  ingest(ev: NostrEvent): void;
  /** Fold the kind 0 we just published into the profile state, relay-scoped on disk. */
  ingestRelayScoped(ev: NostrEvent): void;
  /** The profile lookup relays (user-configured or the defaults). */
  lookupRelays(): string[];
  publishSignedEventToRelays(ev: NostrEvent, relays: readonly string[]): Promise<string[]>;
}

export type OwnProfileSyncReason = 'login' | 'switch' | 'edit' | 'manual';

export interface EditUserMetadataOptions {
  name?: string;
  displayName?: string;
  about?: string;
  picture?: string;
  banner?: string;
  nip05?: string;
  website?: string;
  lud16?: string;
}

export class OwnProfileModule {
  constructor(
    private readonly ctx: OwnProfileContext,
    private readonly deps: OwnProfileDeps,
  ) {}

  async edit(opts: EditUserMetadataOptions, options: { create?: boolean } = {}): Promise<void> {
    const session = this.ctx.session();
    if (!session) throw new CodedError('not-logged-in', 'Not logged in');
    const me = session.pubKeyHex;
    const profileRelays = Array.from(new Set([...this.ctx.relays(), ...DEFAULT_PROFILE_LOOKUP_RELAYS]));

    const cachedEvent = options.create ? null : getCachedKind0(me);
    let existingEvent = cachedEvent;
    if (!options.create) {
      // Bypass the result cache: this read is about to be overwritten by
      // the edit, so it must be the relays' newest copy (a cached one up to
      // a minute old could drop a change made in another client), and the
      // answer is stale the moment the edit publishes, so it is not stored.
      const profileQuery = await this.ctx.queryRelaysWithConfidence(
        profileRelays,
        { kinds: [KIND_METADATA], authors: [me], limit: 5 },
        PROFILE_LOOKUP_MAX_WAIT_MS,
        { cache: 'bypass' },
      );
      existingEvent = newestEvent([
        ...profileQuery.events.filter((e) => e.kind === KIND_METADATA && e.pubkey === me),
        ...(cachedEvent ? [cachedKind0ToEvent(cachedEvent)] : []),
      ]);
      if (!existingEvent && !profileQuery.complete) {
        throw new CodedError('profile-load-failed', 'Could not load your current profile. Try again.');
      }
    }
    const existing = existingEvent ? (JSON.parse(existingEvent.content) as Record<string, unknown>) : {};
    const merged: Record<string, unknown> = { ...existing };
    if (opts.name !== undefined) merged.name = opts.name;
    if (opts.displayName !== undefined) merged.display_name = opts.displayName;
    if (opts.about !== undefined) merged.about = opts.about;
    if (opts.picture !== undefined) merged.picture = opts.picture;
    if (opts.banner !== undefined) merged.banner = opts.banner;
    if (opts.nip05 !== undefined) merged.nip05 = opts.nip05;
    if (opts.website !== undefined) merged.website = opts.website;
    if (opts.lud16 !== undefined) merged.lud16 = opts.lud16;

    const event = await this.ctx.signAndPublish(
      { kind: KIND_METADATA, content: JSON.stringify(merged), tags: [], created_at: Math.floor(Date.now() / 1000) },
      { extraRelays: Array.from(DEFAULT_PROFILE_LOOKUP_RELAYS) },
    );
    setCachedKind0(event);
    this.deps.ingestRelayScoped(event);
    const state = loadProfileSyncState();
    for (const relay of profileRelays) state.ownProfileSyncedToRelay[profileRelayKey(me, relay)] = event.created_at;
    state.ownProfileLookupAt[me] = Date.now();
    saveProfileSyncState(state);
  }

  async sync(reason: OwnProfileSyncReason): Promise<void> {
    const session = this.ctx.session();
    if (!session) return;
    const me = session.pubKeyHex;
    const state = loadProfileSyncState();
    let cached = getCachedKind0(me);
    const now = Date.now();
    const lastLookup = state.ownProfileLookupAt[me] ?? 0;
    const shouldLookup = !cached || now - lastLookup >= OWN_PROFILE_LOOKUP_TTL_MS || reason === 'manual' || reason === 'edit';
    if (shouldLookup) {
      try {
        const newest = await this.findNewest(me);
        state.ownProfileLookupAt[me] = now;
        if (newest) {
          setCachedKind0(newest);
          cached = toCachedKind0(newest);
          this.deps.ingest(newest);
        }
      } catch {
        // Retry on the next sync; a timeout is not an authoritative miss.
      }
      saveProfileSyncState(state);
    }
    if (!cached) return;
    const relay = this.ctx.currentRelayUrl.get();
    const key = profileRelayKey(me, relay);
    if ((state.ownProfileSyncedToRelay[key] ?? 0) >= cached.created_at) return;
    const ok = await this.deps.publishSignedEventToRelays(cachedKind0ToEvent(cached), [relay]);
    if (ok.length > 0) {
      const next = loadProfileSyncState();
      next.ownProfileLookupAt[me] = state.ownProfileLookupAt[me] ?? lastLookup;
      next.ownProfileSyncedToRelay[key] = cached.created_at;
      saveProfileSyncState(next);
    }
  }

  private async findNewest(pubkey: string): Promise<NostrEvent | null> {
    const relays = uniqueRelayUrls([...this.deps.lookupRelays(), ...this.ctx.relays()]);
    // Fresh: `sync` only gets here when its own lookup stamp has expired or
    // the user asked (`manual`, `edit`), so the point is the relays' current
    // answer. The result still refreshes the cache for other readers.
    const result = await this.ctx.queryRelaysWithConfidence(
      relays,
      { kinds: [KIND_METADATA], authors: [pubkey], limit: 5 },
      PROFILE_LOOKUP_MAX_WAIT_MS,
      { cache: 'fresh' },
    );
    const newest = newestEvent(result.events.filter((e) => e.kind === KIND_METADATA && e.pubkey === pubkey));
    if (!newest && !result.complete) throw new CodedError('profile-lookup-timeout', 'Profile lookup timed out');
    return newest;
  }
}
