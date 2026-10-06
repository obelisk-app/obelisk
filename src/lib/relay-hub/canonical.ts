/**
 * Canonical filter keys. Two equivalent filters must hash identically, so
 * two callers wanting the same thing share one REQ (requirement (c)).
 *
 * Rules:
 *  - object keys sorted; `undefined` / `null` values dropped (`{authors: undefined}` equals `{}`)
 *  - arrays deduped and sorted, so `kinds: [9, 7]` equals `kinds: [7, 9]`
 *  - hex-valued arrays (`ids`, `authors`, `#e`, `#p`, ...) lowercased before comparison
 *  - an empty array is dropped, except `ids: []`, which is kept because it is
 *    a caller bug worth surfacing (it matches nothing)
 *  - `since`, `until`, `limit`, `search` are part of the key verbatim: two
 *    windows are two REQs, merging them would over-fetch for one caller
 *  - filter order inside a spec does not matter
 *  - the relay URL goes through nostr-tools `normalizeURL`
 *  - `label` is never part of the key
 */
import type { Filter } from 'nostr-tools';
import { normalizeURL } from 'nostr-tools/utils';

const HEX_KEYS = new Set(['ids', 'authors']);

function isHexKey(key: string): boolean {
  // Single-letter tag filters (`#e`, `#p`, `#a`...) carry ids / pubkeys /
  // addresses. Multi-letter tags (`#t`, `#d` are single too, but `#h` is a
  // group id) are not hex by contract, so only lowercase for the two known
  // id-bearing letters plus the top-level id fields.
  return HEX_KEYS.has(key) || key === '#e' || key === '#p';
}

function canonicalArray(key: string, values: readonly unknown[]): (string | number)[] {
  const uniq = new Set<string | number>();
  for (const v of values) {
    if (typeof v === 'number') uniq.add(v);
    else if (typeof v === 'string') uniq.add(isHexKey(key) ? v.toLowerCase() : v);
  }
  return Array.from(uniq).sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  });
}

export function canonicalFilter(filter: Filter): string {
  const source = filter as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    const value = source[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      const arr = canonicalArray(key, value);
      if (arr.length === 0 && key !== 'ids') continue;
      out[key] = arr;
    } else {
      out[key] = value;
    }
  }
  return JSON.stringify(out);
}

export function canonicalFilters(filters: readonly Filter[]): string {
  return filters.map(canonicalFilter).sort().join('');
}

/** Per-relay live subscription key. */
export function subKey(url: string, filters: readonly Filter[]): string {
  return normalizeURL(url) + '|' + canonicalFilters(filters);
}

/** One-shot query key, namespaced by identity because results may be per-recipient (kind 1059 wraps). */
export function queryKey(identityId: string, relays: readonly string[], filters: readonly Filter[]): string {
  const urls = Array.from(new Set(relays.map(normalizeURL))).sort();
  return identityId + '|' + urls.join(',') + '|' + canonicalFilters(filters);
}

export function socketKey(url: string, identityId: string): string {
  return normalizeURL(url) + '|' + identityId;
}

export { normalizeURL };
