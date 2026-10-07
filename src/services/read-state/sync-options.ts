/**
 * The shared vocabulary of the encrypted read-state sync (`relay-sync.ts`):
 * the d tags, the payload shapes, the per-scope options and the small
 * parsers the ingest and publish halves both use.
 */
import type { Rumor } from '@/lib/nip-59';
import type { WrapLedgerScope } from '@/services/nostr-bridge';
import { KIND_GIFT_WRAP, KIND_NIP78_APP_DATA as KIND_INNER } from '@/utils/nostr/nip-kinds';

/** Inner rumor d-tag for groups-scope state events. */
export const D_TAG_GROUPS = 'obelisk:readstate:v1';
/** Inner rumor d-tag for DM-scope state events (also carries inboxLastReadAt). */
export const D_TAG_DMS = 'obelisk:dm-readstate:v1';

// 8s coalesces a burst of cursor advances during active reading without making
// the publish feel deferred. The previous 60s window collapsed against
// real-world usage: users read for less than a minute, then close the tab or
// navigate, and the cleanup cleared the pending timer before flush, so the
// gift wrap was never published and devices never converged. We now also
// flush eagerly on cleanup, visibilitychange to hidden, and pagehide so a
// partial debounce window doesn't lose the publish.
export const DEBOUNCE_MS = 8_000;

/** Schema version for the JSON payload inside the rumor. */
export const SCHEMA_VERSION = 1;

/**
 * How long this sub waits for its first event before the watchdog calls it dead.
 *
 * Much longer than the 5s default, because this REQ is unusually expensive and
 * unusually patient-able. `{kinds:[1059], '#p':[me]}` cannot be narrowed: the
 * outer wrap is signed by a throwaway key (so `authors` is useless), NIP-59
 * fuzzes `created_at` backwards by up to two days (so `since` would drop live
 * cursors), and the wrap that carries our cursors is a needle in a haystack of
 * DM wraps (so `limit` could cut it off). Tagging our own wraps to make them
 * findable is exactly the metadata leak docs/dm-metadata-privacy.md exists to
 * prevent.
 *
 * So the query is as broad as it has to be, and on a loaded relay it can take
 * tens of seconds to return anything. Under the default watchdog that read as
 * failure: the sub was torn down at 5s and retried on a backoff, each retry
 * re-running the same expensive scan, so the cursors never arrived and every
 * channel painted unread. Nothing here is time-critical (it is invisible
 * housekeeping behind a stale-while-revalidate cache), so waiting is strictly
 * better than retrying.
 */
export const READ_STATE_WATCHDOG_MS = 60_000;

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
