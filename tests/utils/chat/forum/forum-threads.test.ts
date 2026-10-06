import { describe, expect, it } from 'vitest';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import type { JsForumTag } from '@/services/nostr-bridge';
import {
  hasExactThreadMatch,
  posterName,
  resolveTopics,
  visibleForumThreads,
} from '@/utils/chat/forum/forum-threads';

const thread = (id: string, name: string, topics: string[] = []) =>
  ({ ...groupFixture({ id, name, kind: 'text' }), topics });
const a = thread('a', 'Alpha notes', ['x']);
const b = thread('b', 'Beta', ['x', 'y']);
const c = thread('c', 'Gamma', ['y']);
const messagesByGroup = {
  a: [{ createdAt: 10 }, { createdAt: 50 }],
  b: [{ createdAt: 30 }, { createdAt: 40 }],
  c: [{ createdAt: 20 }, { createdAt: 60 }],
};
const recent = { sortBy: 'recent', tagMatch: 'any' } as const;

describe('visibleForumThreads', () => {
  it('sorts by last activity, newest first', () => {
    expect(visibleForumThreads([a, b, c], '', [], recent, messagesByGroup).map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('sorts by creation when asked', () => {
    const out = visibleForumThreads([a, b, c], '', [], { ...recent, sortBy: 'created' }, messagesByGroup);
    expect(out.map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('filters by a case-insensitive name substring', () => {
    expect(visibleForumThreads([a, b, c], '  ALPHA ', [], recent, messagesByGroup).map((t) => t.id)).toEqual(['a']);
  });

  it('matches any selected tag, or all of them', () => {
    expect(visibleForumThreads([a, b, c], '', ['x', 'y'], recent, messagesByGroup).map((t) => t.id)).toEqual(['c', 'a', 'b']);
    expect(visibleForumThreads([a, b, c], '', ['x', 'y'], { ...recent, tagMatch: 'all' }, messagesByGroup).map((t) => t.id)).toEqual(['b']);
  });
});

describe('hasExactThreadMatch', () => {
  it('is true for an empty query or an exact (case-insensitive) name', () => {
    expect(hasExactThreadMatch([a], '')).toBe(true);
    expect(hasExactThreadMatch([b], 'beta')).toBe(true);
    expect(hasExactThreadMatch([b], 'bet')).toBe(false);
  });
});

describe('resolveTopics', () => {
  const tags: JsForumTag[] = [{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }] as JsForumTag[];

  it('keeps known tags in topic order, once each', () => {
    expect(resolveTopics(['y', 'zz', 'y', 'x'], tags).map((t) => t.id)).toEqual(['y', 'x']);
  });

  it('is empty when there are no topics or no tags', () => {
    expect(resolveTopics([], tags)).toEqual([]);
    expect(resolveTopics(['x'], [])).toEqual([]);
  });
});

describe('posterName', () => {
  it('names a poster by display name, name, then short hex', () => {
    expect(posterName({ displayName: 'Ana', name: 'ana' }, 'f'.repeat(64))).toBe('Ana');
    expect(posterName({ name: 'ana' }, 'f'.repeat(64))).toBe('ana');
    expect(posterName(null, 'abcdef0123')).toBe('abcdef01…');
  });
});
