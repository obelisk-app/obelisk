import { describe, expect, it } from 'vitest';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import {
  findExactThread,
  forumAccessFlags,
  forumListState,
  forumSearchSubmit,
  resolveChildGroups,
  toggleTagId,
} from '@/utils/chat/forum/forum-view';

const a = groupFixture({ id: 'a', name: 'Alpha notes', kind: 'text' });
const b = groupFixture({ id: 'b', name: 'Beta', kind: 'text' });

describe('resolveChildGroups', () => {
  it('keeps the child id order and skips ids with no known group', () => {
    expect(resolveChildGroups(['b', 'gone', 'a'], [a, b]).map((g) => g.id)).toEqual(['b', 'a']);
  });

  it('returns an empty list for no children', () => {
    expect(resolveChildGroups([], [a, b])).toEqual([]);
  });
});

describe('findExactThread', () => {
  it('matches the whole trimmed name, ignoring case', () => {
    expect(findExactThread([a, b], '  BETA ')?.id).toBe('b');
  });

  it('does not match a substring', () => {
    expect(findExactThread([a, b], 'alpha')).toBeUndefined();
  });
});

describe('forumSearchSubmit', () => {
  it('does nothing for a blank query', () => {
    expect(forumSearchSubmit([a, b], '   ')).toEqual({ kind: 'none' });
  });

  it('opens an exact match', () => {
    expect(forumSearchSubmit([a, b], 'alpha NOTES')).toEqual({ kind: 'open', id: 'a' });
  });

  it('creates one titled with the trimmed query when nothing matches exactly', () => {
    expect(forumSearchSubmit([a, b], '  Alpha  ')).toEqual({ kind: 'create', title: 'Alpha' });
  });
});

describe('toggleTagId', () => {
  it('appends an id that is not selected', () => {
    expect(toggleTagId(['x'], 'y')).toEqual(['x', 'y']);
  });

  it('removes an id that is selected, keeping the rest in order', () => {
    expect(toggleTagId(['x', 'y', 'z'], 'y')).toEqual(['x', 'z']);
  });
});

describe('forumListState', () => {
  const base = { childCount: 2, visibleCount: 2, metadataEose: true, viewMode: 'list' } as const;

  it('is loading while nothing has arrived and metadata EOSE is pending', () => {
    expect(forumListState({ ...base, childCount: 0, visibleCount: 0, metadataEose: false })).toBe('loading');
  });

  it('shows what it has before EOSE', () => {
    expect(forumListState({ ...base, metadataEose: false })).toBe('list');
  });

  it('is empty once EOSE arrives with no publications', () => {
    expect(forumListState({ ...base, childCount: 0, visibleCount: 0 })).toBe('empty');
  });

  it('is no-match when the filters hide every publication', () => {
    expect(forumListState({ ...base, visibleCount: 0 })).toBe('no-match');
  });

  it('follows the view mode otherwise', () => {
    expect(forumListState(base)).toBe('list');
    expect(forumListState({ ...base, viewMode: 'gallery' })).toBe('gallery');
  });
});

describe('forumAccessFlags', () => {
  it('copies the parent flags', () => {
    const parent = { ...a, isPublic: false, isHidden: true, isRestricted: true, isOpen: false };
    expect(forumAccessFlags(parent)).toEqual({ isPublic: false, isHidden: true, isRestricted: true, isOpen: false });
  });

  it('falls back to public, visible, unrestricted and open with no parent', () => {
    expect(forumAccessFlags(null)).toEqual({ isPublic: true, isHidden: false, isRestricted: false, isOpen: true });
  });
});
