import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useReactorHoverCard } from '@/hooks/shell/panes/message/useReactorHoverCard';

describe('useReactorHoverCard', () => {
  it('returns the same list while the set is the same', () => {
    const pubkeys = new Set(['a', 'b']);
    const { result, rerender } = renderHook(({ s }) => useReactorHoverCard(s), { initialProps: { s: pubkeys } });
    const first = result.current;
    expect(first.shown).toEqual(['a', 'b']);
    rerender({ s: pubkeys });
    expect(result.current).toBe(first);
  });
});
