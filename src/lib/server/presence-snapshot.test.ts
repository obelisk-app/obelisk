// src/lib/server/presence-snapshot.test.ts
import { describe, it, expect } from 'vitest';
import { buildPresenceSnapshot } from './presence-snapshot';

describe('buildPresenceSnapshot', () => {
  it('returns an empty list when no one is online', () => {
    expect(buildPresenceSnapshot(new Map())).toEqual([]);
  });

  it('returns one entry per pubkey regardless of socket count (multi-tab dedup)', () => {
    const m = new Map<string, Set<string>>();
    m.set('npub_alice', new Set(['s1', 's2', 's3']));
    m.set('npub_bob', new Set(['s4']));
    const snap = buildPresenceSnapshot(m);
    expect(snap.sort()).toEqual(['npub_alice', 'npub_bob']);
  });

  it('skips pubkeys with empty socket sets (defensive)', () => {
    const m = new Map<string, Set<string>>();
    m.set('npub_alice', new Set());
    m.set('npub_bob', new Set(['s1']));
    expect(buildPresenceSnapshot(m)).toEqual(['npub_bob']);
  });
});
