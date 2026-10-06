/**
 * The read side of `useFeed`: moderation, repost grouping and the bounded
 * re-rank window.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Event as NostrEvent } from 'nostr-tools';

vi.mock('@/services/social/engagement', () => ({
  ensureCounts: vi.fn().mockResolvedValue(undefined),
  getCounts: () => ({ reactionCount: 0, repostCount: 0, zapTotalSats: 0, replyCount: 0 }),
}));
vi.mock('@/services/social/profiles', () => ({ ensureSocialProfiles: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({ useMyFollows: () => [] });
});

import { useModerationStore } from '@/store/moderation';
import { ensureCounts } from '@/services/social/engagement';
import { useFeedSignals, useRankedFeed } from '@/hooks/social/useFeedRanking';

const note = (id: string, pubkey: string, created_at: number): NostrEvent => ({
  id: id.repeat(64).slice(0, 64),
  pubkey: pubkey.repeat(64),
  created_at,
  kind: 1,
  tags: [],
  content: id,
  sig: '0'.repeat(128),
});

describe('useRankedFeed', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    useModerationStore.setState({ mutedPubkeys: [], blockedPubkeys: [] });
    vi.useRealTimers();
  });

  it('drops muted and blocked authors and leaves a recent feed in window order', () => {
    useModerationStore.setState({ mutedPubkeys: ['b'.repeat(64)], blockedPubkeys: ['c'.repeat(64)] });
    const notes = [note('1', 'a', 10), note('2', 'b', 30), note('3', 'c', 40), note('4', 'a', 20)];
    const { result } = renderHook(() => useRankedFeed(notes, 'recent', 'k', false));
    expect(result.current.ordered.map((n) => n.content)).toEqual(['1', '4']);
  });

  it('stops re-ranking a Top feed after the settle window', () => {
    const notes = [note('1', 'a', 10)];
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useRankedFeed(notes, 'top', 'k', false);
    });
    const settled = () => renders;
    act(() => { vi.advanceTimersByTime(4000 * 5); });
    const afterWindow = settled();
    expect(afterWindow).toBeGreaterThan(1);
    act(() => { vi.advanceTimersByTime(4000 * 10); });
    expect(settled()).toBe(afterWindow);
  });
});

describe('useFeedSignals', () => {
  it('warms counts for the top 40, and for 100 when ranking by top', () => {
    const notes = Array.from({ length: 120 }, (_, i) => note(i.toString(16), 'a', i));
    vi.mocked(ensureCounts).mockClear();
    renderHook(() => useFeedSignals(notes, 'top'));
    const sizes = vi.mocked(ensureCounts).mock.calls.map(([ids]) => ids.length);
    expect(sizes).toEqual([40, 100]);
  });
});
