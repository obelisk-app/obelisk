/**
 * The fixed WoT policy: which config changes void verdicts, which kinds are
 * never gated, and how one batch answer becomes a verdict.
 */
import { describe, expect, it } from 'vitest';
import { batchVerdict, verdictsInvalidated } from '@/services/wot/policy';
import { ALWAYS_ALLOW_KINDS, DEFAULT_WOT_CONFIG } from '@/constants/wot/policy';

const cfg = { enabled: true, maxHops: 2, minPaths: 2 };

describe('wot policy', () => {
  it('any of enabled, maxHops or minPaths changing voids verdicts', () => {
    expect(verdictsInvalidated(cfg, { ...cfg })).toBe(false);
    expect(verdictsInvalidated(cfg, { ...cfg, enabled: false })).toBe(true);
    expect(verdictsInvalidated(cfg, { ...cfg, maxHops: 3 })).toBe(true);
    expect(verdictsInvalidated(cfg, { ...cfg, minPaths: 1 })).toBe(true);
    expect(DEFAULT_WOT_CONFIG).toEqual({ enabled: false, maxHops: 2, minPaths: 1 });
  });

  it('never gates group structure or voice signaling', () => {
    for (const kind of [39000, 39001, 39002, 9007]) expect(ALWAYS_ALLOW_KINDS.has(kind)).toBe(true);
    expect(ALWAYS_ALLOW_KINDS.has(1)).toBe(false);
  });

  it('allows within hops with enough paths, or with no path count reported', () => {
    expect(batchVerdict({ distance: 1, paths: 2 }, cfg)).toEqual({ allow: true, distance: 1 });
    expect(batchVerdict({ distance: 2, paths: null }, cfg)).toEqual({ allow: true, distance: 2 });
    expect(batchVerdict({ distance: 1, paths: 1 }, cfg)).toEqual({ allow: false, distance: null });
    expect(batchVerdict({ distance: 3, paths: 5 }, cfg)).toEqual({ allow: false, distance: null });
    expect(batchVerdict({ distance: -1, paths: null }, cfg)).toEqual({ allow: false, distance: null });
    expect(batchVerdict(undefined, cfg)).toEqual({ allow: false, distance: null });
  });
});
