/**
 * Typed wrapper around `window.nostr.wot` (the nostr-wot extension API).
 *
 * Returns `null` rather than throwing when the extension is absent or any
 * call rejects — callers treat that as "no verdict, fail-open" per the
 * design in docs/wot-integration-plan.md.
 */

export type WotStatus = 'absent' | 'configured' | 'error';

export interface WotProbe {
  status: WotStatus;
  /** Active user pubkey hex inside the extension, when known. */
  user?: string | null;
}

interface NostrWotApi {
  getStatus?: () => Promise<unknown>;
  getDistance?: (pubkey: string) => Promise<number | null | undefined>;
  getDistanceBatch?: (
    pubkeys: string[],
    opts?: { maxHops?: number; minPaths?: number },
  ) => Promise<Record<string, number | null>>;
  isInMyWoT?: (pubkey: string, opts?: { maxHops?: number; minPaths?: number }) => Promise<boolean>;
  /**
   * Minimum number of node-disjoint trust paths from the active user to
   * `pubkey`. Higher values mean the verdict is corroborated by multiple
   * independent followers — a single shilled follow can claim 1° but not
   * sustain a high path count. Optional in the API; the engine falls back
   * to distance-only when the extension doesn't expose it.
   */
  getMinPaths?: (pubkey: string, opts?: { maxHops?: number }) => Promise<number | null | undefined>;
}

function api(): NostrWotApi | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { nostr?: { wot?: NostrWotApi } };
  return w.nostr?.wot ?? null;
}

export async function wotProbe(): Promise<WotProbe> {
  const a = api();
  if (!a) return { status: 'absent' };
  // Consider the extension "configured" if ANY distance method exists.
  // Some builds expose `getStatus`, others don't — relying on it is fragile.
  const hasDistance =
    typeof a.getDistanceBatch === 'function' ||
    typeof a.getDistance === 'function';
  if (!hasDistance) return { status: 'absent' };
  if (typeof a.getStatus === 'function') {
    try {
      const raw = await a.getStatus();
      if (raw && typeof raw === 'object') {
        const r = raw as { configured?: boolean; user?: string | null };
        if (r.configured === false) return { status: 'absent' };
        return { status: 'configured', user: r.user ?? null };
      }
    } catch {
      return { status: 'error' };
    }
  }
  return { status: 'configured' };
}

/**
 * Batch distance lookup. Returns a map of `pubkey → distance` where
 * `distance` is the hop count from the active user. `null` distance means
 * "not reachable within maxHops" — i.e. out of WoT.
 *
 * Resolves with `null` (not partial) when the extension is missing or the
 * call rejects so callers can apply the fail-open policy uniformly.
 */
export interface WotBatchEntry {
  /** Hop distance from the active user, or `null` when out of `maxHops`. */
  distance: number | null;
  /**
   * Minimum disjoint trust paths within `maxHops`. `null` when the
   * extension doesn't report it — engine treats null as "satisfies any
   * minPaths threshold" (fail-open per-field, not per-pubkey).
   */
  paths: number | null;
}

export async function wotBatch(
  pubkeys: string[],
  maxHops: number,
  minPaths: number,
): Promise<Record<string, WotBatchEntry> | null> {
  if (pubkeys.length === 0) return {};
  const a = api();
  if (!a) return null;
  try {
    const out: Record<string, WotBatchEntry> = {};
    let distanceMap: Record<string, number | null> | null = null;
    if (typeof a.getDistanceBatch === 'function') {
      distanceMap = await a.getDistanceBatch(pubkeys, { maxHops, minPaths });
    } else if (typeof a.getDistance === 'function') {
      distanceMap = {};
      await Promise.all(
        pubkeys.map(async (pk) => {
          try {
            const d = await a.getDistance!(pk);
            distanceMap![pk] = typeof d === 'number' ? d : null;
          } catch {
            distanceMap![pk] = null;
          }
        }),
      );
    } else {
      return null;
    }
    // Optional path count — only queried when the user requires more than
    // one path, since per-pubkey calls cost extension round-trips.
    const wantPaths = minPaths > 1 && typeof a.getMinPaths === 'function';
    if (wantPaths) {
      await Promise.all(
        pubkeys.map(async (pk) => {
          try {
            const p = await a.getMinPaths!(pk, { maxHops });
            out[pk] = { distance: distanceMap![pk] ?? null, paths: typeof p === 'number' ? p : null };
          } catch {
            out[pk] = { distance: distanceMap![pk] ?? null, paths: null };
          }
        }),
      );
    } else {
      for (const pk of pubkeys) {
        out[pk] = { distance: distanceMap[pk] ?? null, paths: null };
      }
    }
    return out;
  } catch {
    return null;
  }
}

export async function wotDistance(pubkey: string): Promise<number | null> {
  const a = api();
  if (!a || typeof a.getDistance !== 'function') return null;
  try {
    const d = await a.getDistance(pubkey);
    return typeof d === 'number' ? d : null;
  } catch {
    return null;
  }
}
