import { describe, it, expect, beforeEach } from 'vitest';
import { hydrateFollows, ingestKind3, getFollowSet, _resetFollows } from './follows';

const me = 'a'.repeat(64);

beforeEach(() => {
  localStorage.clear();
  _resetFollows();
});

describe('follows', () => {
  it('cold load with no cache returns null follow set', () => {
    hydrateFollows(me);
    expect(getFollowSet(me)).toBeNull();
  });

  it('hydrate seeds the in-memory set from localStorage', () => {
    localStorage.setItem(`obelisk:follows:${me}`, JSON.stringify({
      event: { id: 'e1', kind: 3, pubkey: me, created_at: 1000, tags: [['p', 'b'.repeat(64)]], content: '', sig: 'x' },
      pubkeys: ['b'.repeat(64)],
      lastCheckedAt: 1000,
    }));
    hydrateFollows(me);
    expect(getFollowSet(me)).toEqual(new Set(['b'.repeat(64)]));
  });

  it('ingestKind3 with newer created_at replaces the set', () => {
    hydrateFollows(me);
    ingestKind3(me, { id: 'e1', kind: 3, pubkey: me, created_at: 1000, tags: [['p', 'b'.repeat(64)]], content: '', sig: 'x' } as any);
    ingestKind3(me, { id: 'e2', kind: 3, pubkey: me, created_at: 2000, tags: [['p', 'c'.repeat(64)]], content: '', sig: 'x' } as any);
    expect(getFollowSet(me)).toEqual(new Set(['c'.repeat(64)]));
  });

  it('ignores older kind-3 events', () => {
    hydrateFollows(me);
    ingestKind3(me, { id: 'e1', kind: 3, pubkey: me, created_at: 2000, tags: [['p', 'c'.repeat(64)]], content: '', sig: 'x' } as any);
    ingestKind3(me, { id: 'e2', kind: 3, pubkey: me, created_at: 1000, tags: [['p', 'b'.repeat(64)]], content: '', sig: 'x' } as any);
    expect(getFollowSet(me)).toEqual(new Set(['c'.repeat(64)]));
  });

  it('rejects an older kind-3 even if ingest is called before hydrateFollows', () => {
    const newer = { id: 'new', kind: 3, pubkey: me, created_at: 2000, tags: [['p', 'b'.repeat(64)]], content: '', sig: 'x' } as any;
    // Pre-seed localStorage as if a previous session cached a newer follow list.
    localStorage.setItem(`obelisk:follows:${me}`, JSON.stringify({ event: newer, pubkeys: ['b'.repeat(64)], lastCheckedAt: 2000 }));
    // No hydrateFollows call.
    ingestKind3(me, { id: 'old', kind: 3, pubkey: me, created_at: 1000, tags: [['p', 'c'.repeat(64)]], content: '', sig: 'x' } as any);
    // Cache should still hold the newer event.
    const blob = JSON.parse(localStorage.getItem(`obelisk:follows:${me}`) ?? '{}');
    expect(blob.event.id).toBe('new');
  });
});
