import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useZapperHoverCard } from '@/hooks/shell/panes/message/useZapperHoverCard';
import type { MessageZapTotal } from '@/hooks/chat/zaps/useMessageZaps';

describe('useZapperHoverCard', () => {
  it('lists the zappers largest first', () => {
    const zap: MessageZapTotal = { totalSats: 30, count: 2, zappers: new Set(['a', 'b']), zapperAmounts: new Map([['a', 10], ['b', 20]]) };
    const { result } = renderHook(() => useZapperHoverCard(zap));
    expect(result.current.shown).toEqual([['b', 20], ['a', 10]]);
    expect(result.current.extra).toBe(0);
  });
});
