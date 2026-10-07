import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { useArticleCard } from '@/hooks/social/article/useArticleCard';

const article = (tags: string[][], content = 'word '.repeat(440)): NostrEvent => ({
  id: 'a', pubkey: 'b', kind: 30023, created_at: 1, sig: '', content, tags,
});

describe('useArticleCard', () => {
  it('reads the title, reading time and teaser', () => {
    const { result } = renderHook(() => useArticleCard(article([['title', 'T'], ['summary', 'Short']])));
    expect(result.current.meta.title).toBe('T');
    expect(result.current.minutes).toBe(2);
    expect(result.current.excerpt).toBe('Short');
  });

  it('keeps the parsed tags while the note is the same', () => {
    const note = article([]);
    const { result, rerender } = renderHook(() => useArticleCard(note));
    const first = result.current.meta;
    rerender();
    expect(result.current.meta).toBe(first);
  });
});
