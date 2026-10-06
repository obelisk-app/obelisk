import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';

const fetchArticleHighlights = vi.hoisted(() => vi.fn());
vi.mock('@/services/social/highlights', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/social/highlights')>()),
  fetchArticleHighlights,
}));
vi.mock('@/hooks/usePreferences', () => ({
  usePreferences: () => ({ socialRelays: ['wss://r.example'] }),
}));

import { useArticleHighlights } from '@/hooks/social/useArticleHighlights';

const ARTICLE = { id: 'a1', pubkey: 'p'.repeat(64), kind: 30023, content: 'body', tags: [['d', 'x']], created_at: 1, sig: '' } as NostrEvent;

beforeEach(() => fetchArticleHighlights.mockReset().mockResolvedValue([]));

describe('useArticleHighlights', () => {
  it('fetches nothing until asked', () => {
    const { result } = renderHook(() => useArticleHighlights(ARTICLE));
    expect(result.current.showHighlights).toBe(false);
    expect(fetchArticleHighlights).not.toHaveBeenCalled();
  });

  it('fetches once on the relays the reader chose', async () => {
    const { result } = renderHook(() => useArticleHighlights(ARTICLE));
    await act(async () => { result.current.setShowHighlights(true); });
    expect(fetchArticleHighlights).toHaveBeenCalledWith(ARTICLE, { relays: ['wss://r.example'] });
    expect(result.current.highlights).toEqual([]);
    await act(async () => { result.current.setShowHighlights(false); });
    await act(async () => { result.current.setShowHighlights(true); });
    expect(fetchArticleHighlights).toHaveBeenCalledTimes(1);
  });

  it('treats a failed fetch as no highlights', async () => {
    fetchArticleHighlights.mockRejectedValueOnce(new Error('down'));
    const { result } = renderHook(() => useArticleHighlights(ARTICLE));
    await act(async () => { result.current.setShowHighlights(true); });
    expect(result.current.highlights).toEqual([]);
    expect(result.current.runs).toEqual([]);
  });
});
