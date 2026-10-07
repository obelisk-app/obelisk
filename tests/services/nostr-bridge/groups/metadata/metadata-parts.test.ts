import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { editMetadataTags } from '@/services/nostr-bridge/groups/metadata/metadata-tags';
import { GroupNesting } from '@/services/nostr-bridge/groups/metadata/nesting';
import { MetadataEoseLadder } from '@/services/nostr-bridge/groups/metadata/metadata-eose';
import { StateStore } from '@/services/nostr-bridge/common/state-store';
import type { JsGroup } from '@/services/nostr-bridge/common/types';

describe('groups/metadata-tags', () => {
  it('writes every field asked for, the variant marker, and keeps the forum-tag colour in slot 4', () => {
    expect(editMetadataTags({
      groupId: 'g', name: 'General', isPublic: false, isHidden: true, isOpen: true, parent: 'cat', kind: 'forum',
      forumTags: [{ id: 'a', name: 'A', emoji: null, color: 'lime' }, { id: 'b', name: 'B', emoji: 'x', color: null }, { id: '', name: 'skip', emoji: null, color: null }],
      topics: ['t1', ''],
    })).toEqual([
      ['h', 'g'], ['name', 'General'], ['private'], ['hidden'], ['open'], ['parent', 'cat'], ['t', 'forum'],
      ['forum-tag', 'a', 'A', '', 'lime'], ['forum-tag', 'b', 'B', 'x'], ['topic', 't1'],
    ]);
  });

  it('omits the marker for a text channel, which reverts a voice or forum channel', () => {
    expect(editMetadataTags({ groupId: 'g', kind: 'text' })).toEqual([['h', 'g']]);
  });
});

describe('groups/nesting', () => {
  it('moves a channel between parents, dropping an emptied bucket', () => {
    const n = new GroupNesting();
    n.move('c1', 'p1');
    n.move('c2', 'p1');
    expect(n.childrenByParent.get()).toEqual({ p1: ['c1', 'c2'] });
    n.move('c1', 'p2');
    n.move('c2', null);
    expect(n.childrenByParent.get()).toEqual({ p2: ['c1'] });
    const before = n.childrenByParent.get();
    n.move('c1', 'p2');
    expect(n.childrenByParent.get()).toBe(before);
  });

  it('seeds from the cache, then resets per relay', () => {
    const n = new GroupNesting();
    n.setParent('c1', 'p1');
    n.mergeChildren({ p1: ['c1'] });
    n.move('c1', 'p1');
    expect(n.childrenByParent.get()).toEqual({ p1: ['c1'] });
    n.reset();
    expect(n.childrenByParent.get()).toEqual({});
    n.move('c1', 'p1');
    expect(n.childrenByParent.get()).toEqual({ p1: ['c1'] });
  });
});

describe('groups/metadata-eose', () => {
  afterEach(() => vi.useRealTimers());

  it('holds an empty EOSE through three focused queries before confirming no channels', async () => {
    vi.useFakeTimers();
    const groups = new StateStore<JsGroup[]>([]);
    const eose = new StateStore(false);
    const query = vi.fn(async () => ({ events: [] as NostrEvent[], complete: true }));
    const ladder = new MetadataEoseLadder(
      { session: () => ({ pubKeyHex: 'a', loginMethod: 'nsec', relayUrl: 'wss://r' }), relays: () => ['wss://r'], currentRelayUrl: new StateStore('wss://r'), queryRelaysWithConfidence: query },
      { groups, groupMetadataEose: eose, ingest: vi.fn() },
    );
    ladder.handleEose();
    for (const delay of [1500, 3000, 5000]) {
      expect(eose.get()).toBe(false);
      await vi.advanceTimersByTimeAsync(delay);
    }
    expect(query).toHaveBeenCalledTimes(3);
    expect(eose.get()).toBe(true);
  });

  it('confirms at once when the list is already non-empty', () => {
    const groups = new StateStore<JsGroup[]>([{ id: 'g' } as JsGroup]);
    const eose = new StateStore(false);
    const ladder = new MetadataEoseLadder(
      { session: () => null, relays: () => [], currentRelayUrl: new StateStore(''), queryRelaysWithConfidence: vi.fn() },
      { groups, groupMetadataEose: eose, ingest: vi.fn() },
    );
    ladder.handleEose();
    expect(eose.get()).toBe(true);
  });
});
