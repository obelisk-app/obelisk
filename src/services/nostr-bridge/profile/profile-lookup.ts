/**
 * Kind 0 off the profile-lookup relays (`DEFAULT_PROFILE_LOOKUP_RELAYS`, or
 * the user's override): one multi-author query per relay per batch, merged
 * and split back per author by the hub's author batching
 * (`queryAuthorsWithConfidence`), with a per-pubkey TTL stamp, the cache's
 * negative cooldown for a confirmed miss, and an in-flight guard.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { KIND_METADATA } from '@/constants/nostr/nip-kinds';
import { BoundedMap } from '@nostr-wot/relay/hub';
import type { BridgeContext } from '../facade/context';
import {
  loadProfileSyncState,
  newestEvent,
  saveProfileSyncState,
  setCachedKind0,
} from './profile-sync-cache';
import { DEFAULT_PROFILE_LOOKUP_RELAYS, OTHER_PROFILE_LOOKUP_TTL_MS, OWN_PROFILE_LOOKUP_TTL_MS, PROFILE_LOOKUP_MAX_WAIT_MS, PROFILE_LOOKUP_RELAYS_KEY } from '@/constants/nostr-bridge/profile';
import { isImportableRelayUrl, uniqueRelayUrls } from '../relay/relay-list';

/** Revisions per author; the hub's batching sums them, so one chatty author cannot starve the batch on a relay that keeps old kind 0s. */
const KIND0_REVISIONS_PER_AUTHOR = 5;

export type ProfileLookupContext = Pick<BridgeContext, 'session' | 'queryAuthorsWithConfidence'>;

export interface ProfileLookupDeps {
  now(): number;
  /** The cache's negative set (`ProfileCache`). */
  isMissing(pubkey: string): boolean;
  markMissing(pubkey: string): void;
  /** Ingest a found kind 0 (not cached relay-scoped: it came from the lookup relays). */
  ingest(ev: NostrEvent): void;
}

export class ProfileLookup {
  /** The external lookup's per-pubkey TTL stamp. */
  private readonly lookupAt: BoundedMap<string, number>;
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly ctx: ProfileLookupContext,
    private readonly deps: ProfileLookupDeps,
    bookkeepingMax: number,
  ) {
    this.lookupAt = new BoundedMap<string, number>({ maxEntries: bookkeepingMax, policy: 'fifo', now: () => deps.now() });
  }

  /**
   * Resolve kind 0 for `batch` against the profile-lookup relays, as one
   * multi-author query per relay rather than one per pubkey. The TTL, the
   * negative cooldown and the in-flight guard stay per pubkey: batching is
   * a transport detail, so a pubkey already covered by a recent lookup is
   * dropped from the filter instead of dragging the whole batch back onto
   * the wire.
   */
  lookup(batch: readonly string[]): Promise<void> {
    const now = this.deps.now();
    const me = this.ctx.session()?.pubKeyHex;
    const ownState = me && batch.includes(me) ? loadProfileSyncState() : null;
    const targets = batch.filter((pubkey) => {
      const isMe = pubkey === me;
      const last = (isMe ? ownState?.ownProfileLookupAt[pubkey] : undefined) ?? this.lookupAt.peek(pubkey) ?? 0;
      if (now - last < (isMe ? OWN_PROFILE_LOOKUP_TTL_MS : OTHER_PROFILE_LOOKUP_TTL_MS)) return false;
      if (!isMe && this.deps.isMissing(pubkey)) return false;
      return !this.inFlight.has(pubkey);
    });
    if (targets.length === 0) return Promise.resolve();
    const p = (async () => {
      try {
        // One filter per author so the hub's batching gives each its own
        // revision budget and hands each back only its own events.
        const result = await this.ctx.queryAuthorsWithConfidence(
          this.lookupRelays(),
          targets.map((pubkey) => ({ kinds: [KIND_METADATA], authors: [pubkey], limit: KIND0_REVISIONS_PER_AUTHOR })),
          PROFILE_LOOKUP_MAX_WAIT_MS,
        );
        let nextOwnState: ReturnType<typeof loadProfileSyncState> | null = null;
        for (const [i, pubkey] of targets.entries()) {
          const newest = newestEvent(result.perFilter[i] ?? []);
          if (newest) {
            this.lookupAt.set(pubkey, now);
            if (pubkey === me) {
              nextOwnState = nextOwnState ?? loadProfileSyncState();
              nextOwnState.ownProfileLookupAt[pubkey] = now;
            }
            setCachedKind0(newest);
            this.deps.ingest(newest);
          } else if (result.complete) {
            // Every lookup relay answered and none has it: a real miss, on
            // the negative cooldown, not the positive TTL.
            if (pubkey === me) {
              nextOwnState = nextOwnState ?? loadProfileSyncState();
              nextOwnState.ownProfileLookupAt[pubkey] = now;
            } else {
              this.deps.markMissing(pubkey);
            }
          }
        }
        if (nextOwnState) saveProfileSyncState(nextOwnState);
      } catch {
        // best-effort only; do not cache a timeout as a profile miss
      } finally {
        for (const pubkey of targets) this.inFlight.delete(pubkey);
      }
    })();
    for (const pubkey of targets) this.inFlight.set(pubkey, p);
    return p;
  }

  lookupRelays(): string[] {
    if (typeof window === 'undefined') return Array.from(DEFAULT_PROFILE_LOOKUP_RELAYS);
    try {
      const raw = window.localStorage.getItem(PROFILE_LOOKUP_RELAYS_KEY);
      if (!raw) return Array.from(DEFAULT_PROFILE_LOOKUP_RELAYS);
      const parsed = JSON.parse(raw) as string[];
      const imported = Array.isArray(parsed) ? parsed.filter(isImportableRelayUrl) : [];
      return imported.length > 0 ? uniqueRelayUrls(imported) : Array.from(DEFAULT_PROFILE_LOOKUP_RELAYS);
    } catch {
      return Array.from(DEFAULT_PROFILE_LOOKUP_RELAYS);
    }
  }
}
