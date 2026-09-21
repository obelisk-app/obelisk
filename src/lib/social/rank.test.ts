import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import {
  RECENCY_HALF_LIFE_S,
  applySort,
  authorPenalty,
  engagementScore,
  followBoost,
  rankNotes,
  recencyDecay,
  repostBoost,
  wotBoost,
} from './rank';

const NOW = 1_700_000_000;

const note = (id: string, over: Partial<NostrEvent> = {}): NostrEvent => ({
  id,
  pubkey: 'author',
  content: '',
  created_at: NOW,
  tags: [],
  kind: 1,
  sig: '',
  ...over,
});

const ZERO = { replyCount: 0, repostCount: 0, reactionCount: 0, zapTotalSats: 0 };

const signals = (over: Partial<Parameters<typeof rankNotes>[1]> = {}) => ({
  counts: () => ZERO,
  isFollowed: () => false,
  repostersOf: () => [],
  now: NOW,
  ...over,
});

describe('engagementScore', () => {
  it('ranks a reply above a like, and a zap above both', () => {
    // A reply costs effort, a zap costs money, a like costs nothing.
    const reply = engagementScore({ ...ZERO, replyCount: 1 });
    const like = engagementScore({ ...ZERO, reactionCount: 1 });
    const zap = engagementScore({ ...ZERO, zapTotalSats: 1000 });
    expect(reply).toBeGreaterThan(like);
    expect(zap).toBeGreaterThan(like);
  });

  it('damps so one viral note cannot dominate forever', () => {
    // 100x the likes must not be 100x the score, or the feed becomes one
    // post plus noise.
    const ten = engagementScore({ ...ZERO, reactionCount: 10 });
    const thousand = engagementScore({ ...ZERO, reactionCount: 1000 });
    expect(thousand / ten).toBeLessThan(3);
  });

  it('is zero with no engagement', () => {
    expect(engagementScore(ZERO)).toBe(0);
  });
});

describe('recencyDecay', () => {
  it('is 1 at post time and 0.5 one half-life later', () => {
    expect(recencyDecay(0)).toBe(1);
    expect(recencyDecay(RECENCY_HALF_LIFE_S)).toBeCloseTo(0.5, 5);
  });

  it('never goes negative for clock skew', () => {
    expect(recencyDecay(-500)).toBe(1);
  });
});

describe('boosts', () => {
  it('prefers follows but leaves room for strangers', () => {
    expect(followBoost(true)).toBeGreaterThan(followBoost(false));
    // Modest enough that a notable stranger can still surface.
    expect(followBoost(true)).toBeLessThan(2);
  });

  it('damps repost endorsements', () => {
    const two = repostBoost(2);
    const ten = repostBoost(10);
    expect(ten).toBeGreaterThan(two);
    expect(ten / two).toBeLessThan(2);
  });

  it('treats an unresolved or absent WoT distance as neutral', () => {
    // The extension is usually absent; this term must not change ordering.
    expect(wotBoost(null)).toBe(1);
    expect(wotBoost(undefined)).toBe(1);
    expect(wotBoost(1)).toBeGreaterThan(1);
  });

  it('halves the weight of an author\'s second post', () => {
    expect(authorPenalty(0)).toBe(1);
    expect(authorPenalty(1)).toBe(0.5);
    expect(authorPenalty(2)).toBeCloseTo(1 / 3, 5);
  });
});

describe('rankNotes', () => {
  it('puts an engaged note above a bare newer one', () => {
    const notes = [
      note('new', { created_at: NOW }),
      note('engaged', { created_at: NOW - 3600, pubkey: 'other' }),
    ];
    const ranked = rankNotes(notes, signals({
      counts: (id) => (id === 'engaged' ? { ...ZERO, replyCount: 8, reactionCount: 40 } : ZERO),
    }));
    expect(ranked[0].id).toBe('engaged');
  });

  it('stops one prolific author owning the page', () => {
    // Ten recent posts from one person vs one from someone else: the other
    // voice has to appear before the flood is exhausted.
    const flood = Array.from({ length: 10 }, (_, i) =>
      note(`flood${i}`, { pubkey: 'loud', created_at: NOW - i }));
    const other = note('other', { pubkey: 'quiet', created_at: NOW - 20 });
    const ranked = rankNotes([...flood, other], signals());
    expect(ranked.findIndex((n) => n.id === 'other')).toBeLessThan(9);
  });

  it('is stable for equal scores, so the list does not shuffle', () => {
    // Counts arrive asynchronously; equal-scoring notes must keep their
    // chronological order rather than jitter on every update.
    const notes = [note('a', { created_at: NOW }), note('b', { created_at: NOW })];
    const first = rankNotes(notes, signals()).map((n) => n.id);
    const second = rankNotes(notes, signals()).map((n) => n.id);
    expect(first).toEqual(second);
    expect(first).toEqual(['a', 'b']);
  });

  it('ranks identically with and without the WoT extension, minus that term', () => {
    const notes = [
      note('a', { pubkey: 'x', created_at: NOW }),
      note('b', { pubkey: 'y', created_at: NOW - 100 }),
    ];
    const without = rankNotes(notes, signals()).map((n) => n.id);
    const withWot = rankNotes(notes, signals({ wotDistance: () => null })).map((n) => n.id);
    expect(withWot).toEqual(without);
  });

  it('counts only followed reposters as endorsement', () => {
    const notes = [
      note('vouched', { pubkey: 'a', created_at: NOW - 600 }),
      note('plain', { pubkey: 'b', created_at: NOW - 600 }),
    ];
    const ranked = rankNotes(notes, signals({
      isFollowed: (pk) => pk === 'friend',
      repostersOf: (id) => (id === 'vouched' ? ['friend', 'stranger'] : []),
    }));
    expect(ranked[0].id).toBe('vouched');
  });

  it('keeps every note — ranking reorders, it does not filter', () => {
    const notes = [note('a'), note('b', { pubkey: 'x' }), note('c', { pubkey: 'y' })];
    expect(rankNotes(notes, signals())).toHaveLength(3);
  });
});

describe('applySort', () => {
  it('leaves `recent` as the raw timeline', () => {
    const notes = [
      note('new', { created_at: NOW }),
      note('engaged', { created_at: NOW - 3600, pubkey: 'other' }),
    ];
    const out = applySort(notes, 'recent', signals({
      counts: (id) => (id === 'engaged' ? { ...ZERO, reactionCount: 500 } : ZERO),
    }));
    expect(out.map((n) => n.id)).toEqual(['new', 'engaged']);
  });

  it('reorders for `top`', () => {
    const notes = [
      note('new', { created_at: NOW }),
      note('engaged', { created_at: NOW - 3600, pubkey: 'other' }),
    ];
    const out = applySort(notes, 'top', signals({
      counts: (id) => (id === 'engaged' ? { ...ZERO, reactionCount: 500, replyCount: 20 } : ZERO),
    }));
    expect(out[0].id).toBe('engaged');
  });
});
