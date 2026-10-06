import { describe, expect, it } from 'vitest';
import { canonicalFilter, canonicalFilters, queryKey, socketKey, subKey } from '@/lib/relay-hub/canonical';

describe('canonical filter keys', () => {
  it('ignores array order and duplicates', () => {
    expect(canonicalFilter({ kinds: [9, 7, 9] })).toBe(canonicalFilter({ kinds: [7, 9] }));
    expect(canonicalFilter({ '#e': ['b', 'a'] })).toBe(canonicalFilter({ '#e': ['a', 'b', 'a'] }));
  });

  it('ignores key order and undefined or null fields', () => {
    expect(canonicalFilter({ kinds: [9], authors: undefined })).toBe(canonicalFilter({ kinds: [9] }));
    expect(canonicalFilter({ limit: 5, kinds: [9] })).toBe(canonicalFilter({ kinds: [9], limit: 5 }));
  });

  it('lowercases hex fields but not free-text tags', () => {
    expect(canonicalFilter({ authors: ['ABCD'] })).toBe(canonicalFilter({ authors: ['abcd'] }));
    expect(canonicalFilter({ ids: ['ABCD'] })).toBe(canonicalFilter({ ids: ['abcd'] }));
    expect(canonicalFilter({ '#p': ['ABCD'] })).toBe(canonicalFilter({ '#p': ['abcd'] }));
    expect(canonicalFilter({ '#t': ['Bitcoin'] })).not.toBe(canonicalFilter({ '#t': ['bitcoin'] }));
    expect(canonicalFilter({ '#h': ['Group'] })).not.toBe(canonicalFilter({ '#h': ['group'] }));
  });

  it('drops an empty array except ids, which is a caller bug worth surfacing', () => {
    expect(canonicalFilter({ kinds: [] })).toBe(canonicalFilter({}));
    expect(canonicalFilter({ ids: [] })).not.toBe(canonicalFilter({}));
  });

  it('keeps since, until, limit and search verbatim: different windows are different REQs', () => {
    const base = { kinds: [9] };
    const keys = new Set([
      canonicalFilter(base),
      canonicalFilter({ ...base, since: 1 }),
      canonicalFilter({ ...base, until: 1 }),
      canonicalFilter({ ...base, limit: 1 }),
      canonicalFilter({ ...base, limit: 2 }),
      canonicalFilter({ ...base, search: 'x' }),
    ]);
    expect(keys.size).toBe(6);
  });

  it('ignores filter order inside a spec', () => {
    expect(canonicalFilters([{ kinds: [9] }, { kinds: [7] }])).toBe(canonicalFilters([{ kinds: [7] }, { kinds: [9] }]));
  });

  it('normalizes the relay URL into the key', () => {
    expect(subKey('wss://x.example/', [{ kinds: [9] }])).toBe(subKey('wss://x.example', [{ kinds: [9] }]));
    expect(subKey('x.example', [{ kinds: [9] }])).toBe(subKey('wss://x.example', [{ kinds: [9] }]));
    expect(socketKey('wss://x.example/', 'session')).toBe(socketKey('x.example', 'session'));
    expect(socketKey('x.example', 'session')).not.toBe(socketKey('x.example', 'ephemeral:1'));
  });

  it('query keys sort and dedupe relays and are namespaced by identity', () => {
    expect(queryKey('session', ['wss://b.example', 'wss://a.example', 'a.example'], [{ kinds: [0] }])).toBe(
      queryKey('session', ['wss://a.example/', 'wss://b.example'], [{ kinds: [0] }]),
    );
    expect(queryKey('session', ['wss://a.example'], [{ kinds: [1059] }])).not.toBe(queryKey('ephemeral:1', ['wss://a.example'], [{ kinds: [1059] }]));
  });
});
