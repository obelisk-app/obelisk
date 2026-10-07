import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

const mocks = vi.hoisted(() => ({ fetchArticleHighlights: vi.fn() }));
vi.mock('@/services/social/highlights', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/social/highlights')>()),
  fetchArticleHighlights: mocks.fetchArticleHighlights,
}));
vi.mock('@/hooks/social/profile/useSocialProfile', () => ({ useSocialProfile: () => null }));

import { useArticleReader } from '@/hooks/social/article/useArticleReader';

const NOTE: NostrEvent = {
  id: 'a'.repeat(64), pubkey: 'b'.repeat(64), kind: 30023, created_at: 1_700_000_000, sig: '', content: 'Body',
  tags: [['title', 'T'], ['published_at', '1699000000']],
};

beforeEach(() => mocks.fetchArticleHighlights.mockReset().mockResolvedValue([]));

describe('useArticleReader', () => {
  it('names the author by a key prefix until a profile arrives, and dates the article', () => {
    const { result } = renderHook(() => useArticleReader(NOTE), { wrapper: bridgeWrapper(fakeBridge()) });
    expect(result.current.name).toBe('b'.repeat(10));
    expect(result.current.published).toMatch(/2023/);
    expect(result.current.meta.title).toBe('T');
  });

  it('fetches highlights only when asked, and reports how many', async () => {
    const { result } = renderHook(() => useArticleReader(NOTE), { wrapper: bridgeWrapper(fakeBridge()) });
    expect(result.current.highlightCount).toBeNull();
    expect(mocks.fetchArticleHighlights).not.toHaveBeenCalled();
    act(() => result.current.toggleHighlights());
    expect(result.current.showHighlights).toBe(true);
    await waitFor(() => expect(result.current.highlightCount).toBe(0));
    act(() => result.current.toggleHighlights());
    expect(result.current.highlightCount).toBeNull();
  });
});
