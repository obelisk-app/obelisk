import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JsMessage } from '@/services/nostr-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import { useForumView } from '@/hooks/chat/forum/useForumView';

const msg = (id: string, createdAt: number): JsMessage => ({
  id, pubkey: 'b'.repeat(64), content: id, createdAt, kind: 9, replyToId: null, mentions: [],
});

const forum = { ...groupFixture({ id: 'forum-1', name: 'plaza', kind: 'forum' }), forumTags: [
  { id: 'tag-a', name: 'tagA', emoji: null, color: null },
] };
const early = { ...groupFixture({ id: 'early', name: 'Early bird', kind: 'text' }), parent: 'forum-1', topics: ['tag-a'] };
const late = { ...groupFixture({ id: 'late', name: 'Late riser', kind: 'text' }), parent: 'forum-1', topics: [] };

function seeded() {
  return fakeBridge({
    groups: [forum, early, late],
    childrenByParent: { 'forum-1': ['early', 'late'] },
    messagesByGroup: { early: [msg('e1', 100), msg('e2', 900)], late: [msg('l1', 200), msg('l2', 300)] },
  });
}

const ids = (vm: ReturnType<typeof useForumView>) => vm.visibleThreads.map((g) => g.id);

beforeEach(() => window.localStorage.clear());

describe('useForumView', () => {
  it('lists the children by last activity in list view', () => {
    const { result } = renderHook(() => useForumView('forum-1', vi.fn()), { wrapper: bridgeWrapper(seeded()) });
    expect(ids(result.current)).toEqual(['early', 'late']);
    expect(result.current.listState).toBe('list');
    expect(result.current.forumTags).toHaveLength(1);
  });

  it('re-sorts when the sort pref changes and switches body with the view mode', () => {
    const { result } = renderHook(() => useForumView('forum-1', vi.fn()), { wrapper: bridgeWrapper(seeded()) });
    act(() => result.current.updatePrefs({ sortBy: 'created', viewMode: 'gallery' }));
    expect(ids(result.current)).toEqual(['late', 'early']);
    expect(result.current.listState).toBe('gallery');
  });

  it('toggles and clears tag filters', () => {
    const { result } = renderHook(() => useForumView('forum-1', vi.fn()), { wrapper: bridgeWrapper(seeded()) });
    act(() => result.current.tags.toggle('tag-a'));
    expect(result.current.tags.hasFilter).toBe(true);
    expect(ids(result.current)).toEqual(['early']);
    act(() => result.current.tags.toggle('tag-a'));
    expect(result.current.tags.hasFilter).toBe(false);
    act(() => result.current.tags.toggle('tag-a'));
    act(() => result.current.tags.clear());
    expect(ids(result.current)).toEqual(['early', 'late']);
  });

  it('submit opens an exact match, or the composer prefilled with the trimmed query', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useForumView('forum-1', onSelect), { wrapper: bridgeWrapper(seeded()) });
    act(() => result.current.search.setQuery('late RISER'));
    expect(result.current.search.exactMatch).toBe(true);
    act(() => result.current.search.submit());
    expect(onSelect).toHaveBeenCalledWith('late');
    expect(result.current.composer.open).toBe(false);

    act(() => result.current.search.setQuery('  new idea '));
    expect(result.current.listState).toBe('no-match');
    act(() => result.current.search.submit());
    expect(result.current.composer.open).toBe(true);
    expect(result.current.composer.prefillTitle).toBe('new idea');
  });

  it('created closes the composer, clears the search and opens the child', () => {
    const onSelect = vi.fn();
    const { result } = renderHook(() => useForumView('forum-1', onSelect), { wrapper: bridgeWrapper(seeded()) });
    act(() => result.current.search.setQuery('draft'));
    act(() => result.current.composer.openFromSearch());
    expect(result.current.composer.prefillTitle).toBe('draft');
    act(() => result.current.composer.created('child-1'));
    expect(result.current.composer.open).toBe(false);
    expect(result.current.search.query).toBe('');
    expect(onSelect).toHaveBeenCalledWith('child-1');
  });

  it('resets search and tags when the forum changes', () => {
    const { result, rerender } = renderHook(({ id }) => useForumView(id, vi.fn()), {
      wrapper: bridgeWrapper(seeded()),
      initialProps: { id: 'forum-1' },
    });
    act(() => result.current.search.setQuery('early'));
    act(() => result.current.tags.toggle('tag-a'));
    rerender({ id: 'forum-2' });
    expect(result.current.search.query).toBe('');
    expect(result.current.tags.selected).toEqual([]);
  });

  it('is loading until metadata EOSE when no children have arrived, then empty', () => {
    const bridge = fakeBridge({ groups: [forum], groupMetadataEose: false });
    const { result } = renderHook(() => useForumView('forum-1', vi.fn()), { wrapper: bridgeWrapper(bridge) });
    expect(result.current.listState).toBe('loading');
    act(() => bridge.stores.groupMetadataEose.set(true));
    expect(result.current.listState).toBe('empty');
  });
});
