/**
 * The shared vocabulary of the encrypted read-state sync (`relay-sync.ts`):
 * the d tags, the payload shapes, the per-scope options and the small
 * parsers the ingest and publish halves both use.
 */
import type { GiftWrapRumor as Rumor } from '@nostr-wot/dm';
import type { WrapLedgerScope } from '@/services/nostr-bridge';
import { KIND_GIFT_WRAP, KIND_NIP78_APP_DATA as KIND_INNER } from '@/constants/nostr/nip-kinds';
import { SCHEMA_VERSION } from '@/constants/read-state/sync-options';

export interface GroupsPayload {
  v: 1;
  groups: Record<string, { lastReadAt: number }>;
  /**
   * Relay-scoped mention read cursor (unix ms). Optional and additive:
   * `v` stays at 1 because older clients simply ignore the field and
   * newer ones treat its absence as "no remote cursor". Rides in the
   * groups-scope wrap because mentions are per-relay, exactly like the
   * group cursors around it.
   */
  mentionsReadAt?: number;
}

export interface DmsPayload {
  v: 1;
  dms: Record<string, { lastReadAt: number }>;
  inboxLastReadAt: number;
}

/**
 * How a scope puts its state on a relay.
 *
 * `replaceable`: a signed kind-30078 addressed by `d` tag. The relay keeps
 * exactly one per (pubkey, kind, d), so the state cannot accumulate. Used for
 * groups scope, whose target is the single relay that owns those groups and
 * already knows the user from NIP-42 auth and their kind-39002 membership.
 * Nothing is concealed by wrapping there.
 *
 * `giftwrap`: NIP-59 wrap under a throwaway key. No replaceable slot
 * announces the user's app usage. Kept for DM scope, which publishes to the
 * user's NIP-65 third-party relays where that deniability is real.
 */
export type Transport = 'replaceable' | 'giftwrap';

export interface SyncOptions {
  /** Where to subscribe + publish. For groups-scope this is the single home
   * relay; for DM-scope this is the NIP-65 union. */
  readonly relays: ReadonlyArray<string>;
  /** `d` tag: on the event itself when replaceable, on the inner rumor when
   * gift-wrapped. Distinguishes groups state from DM state either way. */
  readonly dTag: string;
  /** Cache key namespace under bridgeCache (per-relay). For DM scope there
   * are multiple relays: cache the merged snapshot under each one. */
  readonly cacheNamespace: string;
  /** Which slot of the wrap ledger this scope marks. Each consumer of the
   * kind-1059 stream tracks its own progress, see `wrap-ledger.ts`. */
  readonly ledgerScope: WrapLedgerScope;
  readonly transport: Transport;
  /**
   * Also ingest legacy gift wraps while migrating a scope off them, so state
   * written by an older client is not stranded. Publishing always uses
   * `transport`.
   */
  readonly alsoReadLegacyWraps?: boolean;
}

/**
 * The kind a scope's snapshot is cached under: the kind it publishes, so a
 * snapshot written by the previous transport can never be mistaken for the
 * current format.
 */
export function cacheKindFor(transport: Transport): number {
  return transport === 'replaceable' ? KIND_INNER : KIND_GIFT_WRAP;
}

export function findInnerDTag(rumor: Rumor): string | null {
  const t = rumor.tags.find((t) => t[0] === 'd');
  return t?.[1] ?? null;
}

export function parsePayload<T>(rumor: Rumor): T | null {
  try {
    const obj = JSON.parse(rumor.content) as { v?: number };
    if (obj.v !== SCHEMA_VERSION) return null;
    return obj as T;
  } catch {
    return null;
  }
}

/** Include identity even though the owning store is account scoped. */
export function syncScopeKey(opts: SyncOptions, pubkey: string): string {
  return JSON.stringify([pubkey, opts.cacheNamespace, opts.dTag]);
}
