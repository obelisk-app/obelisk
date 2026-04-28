import { describe, it, expect } from 'vitest';
import { parseSearchQuery, buildSearchWhere } from './search';

describe('parseSearchQuery', () => {
  it('parses free text words', () => {
    const q = parseSearchQuery('hello world');
    expect(q.text).toEqual(['hello', 'world']);
  });

  it('parses quoted phrases as single text tokens', () => {
    const q = parseSearchQuery('"hello world" test');
    expect(q.text).toEqual(['hello world', 'test']);
  });

  it('parses from: filter', () => {
    const q = parseSearchQuery('from:alice hello');
    expect(q.from).toBe('alice');
    expect(q.text).toEqual(['hello']);
  });

  it('parses in: filter', () => {
    const q = parseSearchQuery('in:general hello');
    expect(q.in).toBe('general');
    expect(q.text).toEqual(['hello']);
  });

  it('parses has: filter', () => {
    const q = parseSearchQuery('has:link');
    expect(q.has).toBe('link');
  });

  it('parses before: and after: dates', () => {
    const q = parseSearchQuery('before:2026-04-01 after:2026-03-01');
    expect(q.before).toEqual(new Date('2026-04-01'));
    expect(q.after).toEqual(new Date('2026-03-01'));
  });

  it('ignores invalid dates', () => {
    const q = parseSearchQuery('before:not-a-date');
    expect(q.before).toBeUndefined();
  });

  it('parses mentions: filter', () => {
    const q = parseSearchQuery('mentions:bob');
    expect(q.mentions).toBe('bob');
  });

  it('parses multiple filters combined', () => {
    const q = parseSearchQuery('from:alice in:general has:image after:2026-01-01 "exact phrase" keyword');
    expect(q.from).toBe('alice');
    expect(q.in).toBe('general');
    expect(q.has).toBe('image');
    expect(q.after).toEqual(new Date('2026-01-01'));
    expect(q.text).toEqual(['exact phrase', 'keyword']);
  });

  it('returns empty query for empty string', () => {
    const q = parseSearchQuery('');
    expect(q.text).toEqual([]);
  });

  it('is case-insensitive for filter keys', () => {
    const q = parseSearchQuery('FROM:alice HAS:Link');
    expect(q.from).toBe('alice');
    expect(q.has).toBe('link');
  });
});

describe('buildSearchWhere', () => {
  const serverId = 'server-1';

  it('always excludes deleted messages and scopes to server', () => {
    const where = buildSearchWhere({ text: [] }, serverId);
    expect(where).toEqual({
      AND: [
        { deletedAt: null },
        { channel: { serverId } },
      ],
    });
  });

  it('adds content contains for text terms', () => {
    const where = buildSearchWhere({ text: ['hello', 'world'] }, serverId) as any;
    expect(where.AND).toContainEqual({ content: { contains: 'hello' } });
    expect(where.AND).toContainEqual({ content: { contains: 'world' } });
  });

  it('resolves from: via member lookup', () => {
    const memberLookup = new Map([['Alice', 'pk-alice']]);
    const where = buildSearchWhere({ text: [], from: 'alice' }, serverId, memberLookup) as any;
    expect(where.AND).toContainEqual({ authorPubkey: 'pk-alice' });
  });

  it('returns no-match when from: does not resolve', () => {
    const memberLookup = new Map([['Bob', 'pk-bob']]);
    const where = buildSearchWhere({ text: [], from: 'alice' }, serverId, memberLookup) as any;
    expect(where.AND).toContainEqual({ authorPubkey: '__no_match__' });
  });

  it('resolves in: via channel lookup', () => {
    const channelLookup = new Map([['general', 'ch-1']]);
    const where = buildSearchWhere({ text: [], in: 'general' }, serverId, undefined, channelLookup) as any;
    expect(where.AND).toContainEqual({ channelId: 'ch-1' });
  });

  it('adds date filters for before/after', () => {
    const before = new Date('2026-04-01');
    const after = new Date('2026-03-01');
    const where = buildSearchWhere({ text: [], before, after }, serverId) as any;
    expect(where.AND).toContainEqual({ createdAt: { lt: before } });
    expect(where.AND).toContainEqual({ createdAt: { gt: after } });
  });

  it('adds has:link filter', () => {
    const where = buildSearchWhere({ text: [], has: 'link' }, serverId) as any;
    expect(where.AND).toContainEqual({ content: { contains: 'http' } });
  });

  it('adds has:image filter with OR conditions', () => {
    const where = buildSearchWhere({ text: [], has: 'image' }, serverId) as any;
    const imageCondition = where.AND.find((c: any) => c.OR);
    expect(imageCondition).toBeDefined();
    expect(imageCondition.OR.length).toBe(5);
  });

  it('adds mentions filter', () => {
    const where = buildSearchWhere({ text: [], mentions: 'bob' }, serverId) as any;
    expect(where.AND).toContainEqual({ content: { contains: 'bob' } });
  });
});
