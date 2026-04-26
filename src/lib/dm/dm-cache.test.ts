import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  putEvent, getEvent, getCachedEvents,
  putSecret, getSecret,
  getCursors, setCursor,
  setFollowSet, evictIfNeeded,
  clearAccount,
  type CachedDMEvent,
} from './dm-cache';
import { getOrCreateCacheKey, _resetCacheKeyState } from './cache-key';

const me = 'a'.repeat(64);
const partnerFollowed = 'b'.repeat(64);
const partnerStranger = 'c'.repeat(64);

function fakeEvent(id: string, ts: number, partner: string): CachedDMEvent {
  return {
    id, pubkey: me, kind: 4, created_at: ts, content: 'CIPHER', tags: [['p', partner]], sig: 'x',
  };
}

const signer = {
  pubkey: me,
  nip44Encrypt: vi.fn(async (_p: string, t: string) => `WRAP|${t}`),
  nip44Decrypt: vi.fn(async (_p: string, c: string) => c.replace(/^WRAP\|/, '')),
};

beforeEach(() => {
  localStorage.clear();
  // clearAccount() drops the in-RAM mirror and the followSets entry for `me`,
  // ensuring each test starts with a true "never set" follow-set state.
  clearAccount(me);
  _resetCacheKeyState();
  signer.nip44Encrypt.mockClear();
  signer.nip44Decrypt.mockClear();
});

describe('dm-cache event store', () => {
  it('round-trips events keyed by pubkey', () => {
    putEvent(me, fakeEvent('id1', 100, partnerStranger));
    expect(getEvent(me, 'id1')?.id).toBe('id1');
    expect(getCachedEvents(me)).toHaveLength(1);
  });

  it('isolates events per account', () => {
    putEvent(me, fakeEvent('id1', 100, partnerStranger));
    expect(getCachedEvents('z'.repeat(64))).toHaveLength(0);
  });

  it('does not store any plaintext substring after putSecret', async () => {
    const key = await getOrCreateCacheKey(me, signer);
    await putSecret(me, key, 'id1', 'Hello secret payload');
    const blob = JSON.stringify(localStorage);
    expect(blob).not.toContain('Hello secret payload');
  });

  it('round-trips a secret', async () => {
    const key = await getOrCreateCacheKey(me, signer);
    await putSecret(me, key, 'id1', 'roundtrip me');
    expect(await getSecret(me, key, 'id1')).toBe('roundtrip me');
  });

  it('cursors monotonically increase', () => {
    setCursor(me, 'nip04In', 100);
    setCursor(me, 'nip04In', 200);
    expect(getCursors(me).nip04In).toBe(200);
    setCursor(me, 'nip04In', 50);
    expect(getCursors(me).nip04In).toBe(200);
  });
});

describe('dm-cache follow-aware eviction', () => {
  it('with an empty follow set, evicts strictly by LRU when cap is exceeded', () => {
    setFollowSet(me, new Set());
    for (let i = 0; i < 2010; i++) putEvent(me, fakeEvent(`id${i}`, 1_000_000 + i, partnerStranger));
    evictIfNeeded(me, 2000);
    expect(getCachedEvents(me).length).toBe(2000);
    expect(getEvent(me, 'id0')).toBeUndefined();
    expect(getEvent(me, 'id2009')).toBeDefined();
  });

  it('protects all events when follow set has never been set (cold start)', () => {
    // No setFollowSet call at all.
    for (let i = 0; i < 2010; i++) putEvent(me, fakeEvent(`id${i}`, 1_000_000 + i, partnerStranger));
    evictIfNeeded(me, 2000);
    expect(getCachedEvents(me)).toHaveLength(2010);
  });

  it('protects all events when follow set is explicitly null (also cold start)', () => {
    setFollowSet(me, null);
    for (let i = 0; i < 2010; i++) putEvent(me, fakeEvent(`id${i}`, 1_000_000 + i, partnerStranger));
    evictIfNeeded(me, 2000);
    expect(getCachedEvents(me)).toHaveLength(2010);
  });

  it('protects events from followed partners; cap applies only to non-followed', () => {
    setFollowSet(me, new Set([partnerFollowed]));
    for (let i = 0; i < 1500; i++) putEvent(me, fakeEvent(`f${i}`, 1_000_000 + i, partnerFollowed));
    for (let i = 0; i < 2500; i++) putEvent(me, fakeEvent(`s${i}`, 2_000_000 + i, partnerStranger));
    evictIfNeeded(me, 2000);
    const all = getCachedEvents(me);
    const followedKept = all.filter(e => e.tags.find(t => t[0] === 'p')?.[1] === partnerFollowed).length;
    const strangerKept = all.filter(e => e.tags.find(t => t[0] === 'p')?.[1] === partnerStranger).length;
    expect(followedKept).toBe(1500);
    expect(strangerKept).toBe(2000);
  });
});

describe('dm-cache clearAccount', () => {
  it('drops all keys for the given account', async () => {
    const key = await getOrCreateCacheKey(me, signer);
    putEvent(me, fakeEvent('id1', 100, partnerStranger));
    await putSecret(me, key, 'id1', 'x');
    setCursor(me, 'nip04In', 1);
    clearAccount(me);
    expect(getCachedEvents(me)).toHaveLength(0);
    expect(getCursors(me).nip04In).toBe(0);
  });
});
