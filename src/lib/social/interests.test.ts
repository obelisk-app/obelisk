import { describe, it, expect } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import {
  KIND_INTERESTS,
  buildInterestsEvent,
  interestsFrom,
  normalizeTag,
  toggleInterest,
} from './interests';

const event = (tags: string[][], extra: Partial<NostrEvent> = {}): NostrEvent => ({
  id: 'x', pubkey: 'a'.repeat(64), kind: KIND_INTERESTS, content: '',
  created_at: 1000, sig: '', tags, ...extra,
});

describe('interests (NIP-51 kind 10015)', () => {
  it('uses the kind other clients read', () => {
    expect(KIND_INTERESTS).toBe(10015);
  });

  /**
   * Relays index `t` tags verbatim, so case is not cosmetic — a feed
   * filtered on `#Bitcoin` misses everything published as `#bitcoin`.
   */
  it('normalises case and the leading hash', () => {
    expect(normalizeTag('#Bitcoin')).toBe('bitcoin');
    expect(normalizeTag('  ##NOSTR ')).toBe('nostr');
    expect(normalizeTag('#')).toBe('');
  });

  it('reads the hashtags out of a list', () => {
    expect(interestsFrom(event([['t', 'bitcoin'], ['t', 'Art'], ['p', 'x']])))
      .toEqual(['bitcoin', 'art']);
  });

  it('treats a missing list as following nothing', () => {
    expect(interestsFrom(null)).toEqual([]);
  });

  it('writes one t tag per hashtag', () => {
    const built = buildInterestsEvent(null, ['bitcoin', 'art']);
    expect(built.kind).toBe(10015);
    expect(built.tags).toEqual([['t', 'bitcoin'], ['t', 'art']]);
  });

  it('dedupes and normalises on write', () => {
    expect(buildInterestsEvent(null, ['#Bitcoin', 'bitcoin', '']).tags)
      .toEqual([['t', 'bitcoin']]);
  });

  /**
   * An interests list can hold `a` pointers to kind-30015 sets this client
   * does not author. Dropping them on a single tag follow would silently
   * unfollow whole sets curated elsewhere.
   */
  it('preserves tags it does not understand', () => {
    const previous = event([['a', '30015:pubkey:d'], ['t', 'old']]);
    const built = buildInterestsEvent(previous, ['new']);
    expect(built.tags).toContainEqual(['a', '30015:pubkey:d']);
    expect(built.tags).toContainEqual(['t', 'new']);
    expect(built.tags).not.toContainEqual(['t', 'old']);
  });

  /** `content` may hold NIP-44-encrypted private entries we cannot read. */
  it('carries the previous content across untouched', () => {
    const previous = event([], { content: 'encrypted-blob' });
    expect(buildInterestsEvent(previous, ['x']).content).toBe('encrypted-blob');
  });

  /** A replaceable event that is not strictly newer is discarded by relays. */
  it('always stamps newer than the event it replaces', () => {
    const future = event([], { created_at: Math.floor(Date.now() / 1000) + 9999 });
    expect(buildInterestsEvent(future, ['x']).created_at).toBeGreaterThan(future.created_at);
  });

  it('toggles a tag on and off', () => {
    expect(toggleInterest(['bitcoin'], 'art')).toEqual(['bitcoin', 'art']);
    expect(toggleInterest(['bitcoin', 'art'], '#ART')).toEqual(['bitcoin']);
  });

  it('ignores an empty toggle', () => {
    expect(toggleInterest(['bitcoin'], '#')).toEqual(['bitcoin']);
  });
});
