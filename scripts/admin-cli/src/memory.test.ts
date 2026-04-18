import { describe, it, expect } from 'vitest';
import { mergeMessages, isChannelUpToDate } from './memory';

function msg(id: string, t: number, content = 'x') {
  return { id, authorPubkey: 'pk', content, createdAt: new Date(t).toISOString() };
}

describe('mergeMessages', () => {
  it('adds everything on first scan (no prior cursor)', () => {
    const fetched = [msg('a', 1000), msg('b', 2000), msg('c', 3000)];
    const r = mergeMessages(undefined, fetched, null);
    expect(r.messages.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(r.newCursor).toBe('c');
    expect(r.newCount).toBe(3);
  });

  it('only keeps messages strictly newer than the prior cursor', () => {
    const existing = [msg('a', 1000), msg('b', 2000)];
    const fetched = [msg('a', 1000), msg('b', 2000), msg('c', 3000), msg('d', 4000)];
    const r = mergeMessages(existing, fetched, 'b');
    expect(r.messages.map((m) => m.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(r.newCount).toBe(2);
    expect(r.newCursor).toBe('d');
  });

  it('returns 0 new when the cursor is the newest fetched id', () => {
    const existing = [msg('a', 1000), msg('b', 2000)];
    const fetched = [msg('a', 1000), msg('b', 2000)];
    const r = mergeMessages(existing, fetched, 'b');
    expect(r.newCount).toBe(0);
    expect(r.newCursor).toBe('b');
  });

  it('deduplicates when cursor is not present in fetched page', () => {
    const existing = [msg('a', 1000)];
    // Older-than-cached scenario: caller forces a re-scan, cursor ('z') not found.
    const fetched = [msg('a', 1000), msg('b', 2000)];
    const r = mergeMessages(existing, fetched, 'z');
    expect(r.messages.map((m) => m.id)).toEqual(['a', 'b']);
    expect(r.newCount).toBe(1);
  });

  it('caps stored messages at RECENT_CAP (200)', () => {
    const many = Array.from({ length: 250 }, (_, i) => msg(`m${i}`, i));
    const r = mergeMessages(undefined, many, null);
    expect(r.messages.length).toBe(200);
    expect(r.messages[0].id).toBe('m50'); // oldest 50 trimmed
    expect(r.newCursor).toBe('m249');
  });
});

describe('isChannelUpToDate', () => {
  it('true when newest id matches cursor', () => {
    expect(isChannelUpToDate('abc', 'abc')).toBe(true);
  });
  it('false when newest differs or is null', () => {
    expect(isChannelUpToDate('abc', 'def')).toBe(false);
    expect(isChannelUpToDate(null, 'abc')).toBe(false);
    expect(isChannelUpToDate('abc', undefined)).toBe(false);
  });
});
