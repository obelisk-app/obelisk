/**
 * The feed lifecycle: seed from the cache before the first paint, fetch and
 * merge a page, keep a live tail, page backwards, and never mix two feeds.
 * Relays and the follow list are compared by content, so a fresh array with
 * the same entries every render does not refetch.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Event as NostrEvent } from 'nostr-tools';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const t = vi.hoisted(() => ({
  cache: {} as Record<string, NostrEvent[]>,
  writes: [] as Array<{ id: string; notes: NostrEvent[] }>,
  pages: [] as Array<{ source: unknown; until?: number; resolve: (notes: NostrEvent[]) => void; reject: (e: Error) => void }>,
  live: [] as Array<(event: NostrEvent) => void>,
}));

vi.mock('@/services/social/cache', async (orig) => ({
  ...(await orig<typeof import('@/services/social/cache')>()),
  readFeedCache: (_relays: readonly string[], id: string) => t.cache[id] ?? [],
  writeFeedCache: (_relays: readonly string[], id: string, notes: NostrEvent[]) => { t.writes.push({ id, notes }); },
}));
vi.mock('@/services/social/feed-source', async (orig) => ({
  ...(await orig<typeof import('@/services/social/feed-source')>()),
  fetchPage: (source: unknown, _relays: readonly string[], until?: number) =>
    new Promise<NostrEvent[]>((resolve, reject) => { t.pages.push({ source, until, resolve, reject }); }),
}));
vi.mock('@/services/social/pool', () => ({
  subscribeSocial: (_filters: unknown, onEvent: (event: NostrEvent) => void) => {
    t.live.push(onEvent);
    return () => { t.live.splice(t.live.indexOf(onEvent), 1); };
  },
}));
vi.mock('@/utils/social/relays', async (orig) => ({
  ...(await orig<typeof import('@/utils/social/relays')>()),
  widenedRelays: (relays: readonly string[]) => relays,
}));
vi.mock('@/hooks/social/feed/useFeedRanking', () => ({
  useFeedSignals: () => {},
  useRankedFeed: (notes: NostrEvent[]) => ({ ordered: notes, repostersByTarget: new Map() }),
}));

import { useFeed, type FeedSource } from '@/hooks/social/feed/useFeed';
import { cacheIdFor } from '@/services/social/feed-source';

const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);
const NOW = Math.floor(Date.now() / 1000);

function note(id: string, pubkey: string, ago: number): NostrEvent {
  return { id: id.padEnd(64, '0'), pubkey, kind: 1, content: id, tags: [], created_at: NOW - ago, sig: '' };
}

const ids = (notes: readonly NostrEvent[]) => notes.map((n) => n.content);

beforeEach(() => {
  t.cache = {};
  t.writes = [];
  t.pages = [];
  t.live = [];
});

describe('useFeed', () => {
  it('paints the cached notes on the first render, then merges the fetched page', async () => {
    const global: FeedSource = { kind: 'global' };
    t.cache[cacheIdFor(global)] = [note('cached', ALICE, 50)];
    const { result } = renderHook(() => useFeed(global, ['wss://r']));
    expect(ids(result.current.notes)).toEqual(['cached']);
    expect(result.current.loading).toBe(false);

    await act(async () => t.pages[0].resolve([note('fresh', BOB, 10)]));
    expect(ids(result.current.notes)).toEqual(['fresh', 'cached']);
    expect(t.writes.at(-1)?.notes.map((n) => n.content)).toEqual(['fresh', 'cached']);
  });

  it('does not refetch for a fresh relay array or follow list with the same contents', async () => {
    const { rerender } = renderHook(({ relays, authors }) => useFeed({ kind: 'following', authors }, relays), {
      initialProps: { relays: ['wss://r'], authors: [ALICE] },
    });
    expect(t.pages).toHaveLength(1);
    rerender({ relays: ['wss://r'], authors: [ALICE] });
    rerender({ relays: ['wss://r'], authors: [ALICE] });
    expect(t.pages).toHaveLength(1);
    expect(t.live).toHaveLength(1);

    rerender({ relays: ['wss://r', 'wss://s'], authors: [ALICE] });
    expect(t.pages).toHaveLength(2);
  });

  it('is not loading while the follow list is still empty, and fetches nothing', () => {
    const { result } = renderHook(() => useFeed({ kind: 'following', authors: [] }, ['wss://r']));
    expect(result.current.loading).toBe(false);
    expect(t.pages).toHaveLength(0);
  });

  it('keeps only notes from followed authors, on the page and on the live tail', async () => {
    const { result } = renderHook(() => useFeed({ kind: 'following', authors: [ALICE] }, ['wss://r']));
    await act(async () => t.pages[0].resolve([note('mine', ALICE, 10), note('stranger', BOB, 5)]));
    expect(ids(result.current.notes)).toEqual(['mine']);

    act(() => {
      t.live[0](note('stranger-live', BOB, -1));
      t.live[0](note('live', ALICE, -1));
    });
    expect(result.current.pendingCount).toBe(1);
    act(() => result.current.showPending());
    expect(ids(result.current.notes)).toEqual(['live', 'mine']);
  });

  it('shows an error only when there is nothing on screen, and refresh clears it', async () => {
    const { result } = renderHook(() => useFeed({ kind: 'global' }, ['wss://r']));
    await act(async () => t.pages[0].reject(new Error('down')));
    expect(result.current.error).toBe(true);
    expect(result.current.loading).toBe(false);

    act(() => result.current.refresh());
    expect(result.current.error).toBe(false);
    await act(async () => t.pages[1].resolve([note('back', ALICE, 1)]));
    expect(ids(result.current.notes)).toEqual(['back']);
  });

  it('drops a page that lands after the reader switched feeds', async () => {
    const { result, rerender } = renderHook(({ source }) => useFeed(source, ['wss://r']), {
      initialProps: { source: { kind: 'global' } as FeedSource },
    });
    await act(async () => t.pages[0].resolve([note('g1', BOB, 10)]));
    act(() => result.current.loadMore());
    const older = t.pages[1];
    expect(older.until).toBe(NOW - 10);

    rerender({ source: { kind: 'profile', pubkey: ALICE } });
    await act(async () => t.pages[2].resolve([note('p1', ALICE, 3)]));
    await act(async () => older.resolve([note('g0', BOB, 20)]));
    await waitFor(() => expect(result.current.loadingMore).toBe(false));
    expect(ids(result.current.notes)).toEqual(['p1']);
  });

  it('does not let an old failed page exhaust the newly selected feed', async () => {
    const { result, rerender } = renderHook(({ source }) => useFeed(source, ['wss://r']), {
      initialProps: { source: { kind: 'global' } as FeedSource },
    });
    await act(async () => t.pages[0].resolve([note('global', BOB, 10)]));
    act(() => result.current.loadMore());
    const oldPage = t.pages[1];
    rerender({ source: { kind: 'profile', pubkey: ALICE } });
    await act(async () => t.pages[2].resolve([note('profile', ALICE, 3)]));
    await act(async () => oldPage.reject(new Error('old relay failed')));
    expect(result.current.exhausted).toBe(false);
    act(() => result.current.loadMore());
    expect(t.pages.at(-1)?.until).toBe(NOW - 3);
  });

  it('starts pagination in a new feed without waiting for the old feed and ignores old cleanup', async () => {
    const { result, rerender } = renderHook(({ source }) => useFeed(source, ['wss://r']), {
      initialProps: { source: { kind: 'global' } as FeedSource },
    });
    await act(async () => t.pages[0].resolve([note('global', BOB, 10)]));
    act(() => result.current.loadMore());
    const oldPage = t.pages[1];
    rerender({ source: { kind: 'profile', pubkey: ALICE } });
    await act(async () => t.pages[2].resolve([note('profile', ALICE, 3)]));
    expect(result.current.loadingMore).toBe(false);
    act(() => result.current.loadMore());
    expect(result.current.loadingMore).toBe(true);
    await act(async () => oldPage.resolve([note('old', BOB, 30)]));
    expect(result.current.loadingMore).toBe(true);
    await act(async () => t.pages[3].resolve([note('older-profile', ALICE, 20)]));
    expect(result.current.loadingMore).toBe(false);
    expect(ids(result.current.notes)).toEqual(['profile', 'older-profile']);
  });

  it('starts only one older-page request when triggered twice before rendering', async () => {
    const { result } = renderHook(() => useFeed({ kind: 'global' }, ['wss://r']));
    await act(async () => t.pages[0].resolve([note('first', ALICE, 10)]));
    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });
    expect(t.pages).toHaveLength(2);
  });

  it('discards a page from a previous visit to the same feed', async () => {
    const { result, rerender } = renderHook(({ source }) => useFeed(source, ['wss://r']), {
      initialProps: { source: { kind: 'global' } as FeedSource },
    });
    await act(async () => t.pages[0].resolve([note('first', ALICE, 10)]));
    act(() => result.current.loadMore());
    const oldPage = t.pages[1];
    rerender({ source: { kind: 'profile', pubkey: ALICE } });
    rerender({ source: { kind: 'global' } });
    await act(async () => t.pages[3].resolve([note('fresh', ALICE, 5)]));
    await act(async () => oldPage.resolve([note('stale', BOB, 30)]));
    expect(ids(result.current.notes)).toEqual(['fresh']);
  });


  it('ignores a queued live event from a subscription closed by a feed switch', () => {
    const { result, rerender } = renderHook(({ source }) => useFeed(source, ['wss://r']), {
      initialProps: { source: { kind: 'global' } as FeedSource },
    });
    const oldDelivery = t.live[0];
    rerender({ source: { kind: 'profile', pubkey: ALICE } });
    act(() => oldDelivery(note('old-global-live', BOB, -1)));
    expect(result.current.pendingCount).toBe(0);
    act(() => result.current.showPending());
    expect(result.current.notes).toEqual([]);
  });

});
