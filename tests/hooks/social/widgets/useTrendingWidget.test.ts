import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { TRENDING_WIDGET_LIMIT, useTrendingWidget } from '@/hooks/social/widgets/useTrendingWidget';

const note = (id: string, pubkey: string, tag: string): NostrEvent => ({
  id, pubkey, kind: 1, content: '', created_at: 1, sig: '', tags: [['t', tag]],
});

describe('useTrendingWidget', () => {
  it('lists tags several authors used', () => {
    const notes = ['a', 'b', 'c'].map((author, i) => note(String(i), author, 'bitcoin'));
    const { result } = renderHook(() => useTrendingWidget(notes));
    expect(result.current.tags.map((tag) => tag.tag)).toEqual(['bitcoin']);
  });

  it('caps the list', () => {
    const notes = Array.from({ length: 12 }, (_, t) => ['a', 'b', 'c'].map((author, i) => note(`${t}-${i}`, author, `tag${t}`))).flat();
    const { result } = renderHook(() => useTrendingWidget(notes));
    expect(result.current.tags.length).toBeLessThanOrEqual(TRENDING_WIDGET_LIMIT);
  });

  it('keeps the same list while the notes do not change', () => {
    const notes = [note('1', 'a', 'x')];
    const { result, rerender } = renderHook(() => useTrendingWidget(notes));
    const first = result.current.tags;
    rerender();
    expect(result.current.tags).toBe(first);
  });
});
