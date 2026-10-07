import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useReactionPills } from '@/hooks/shell/panes/message/useReactionPills';
import type { MessageRowActions } from '@/hooks/shell/panes/message/useMessageRowActions';
import type { GroupedReaction } from '@/utils/message-text/emoji-shortcodes';

const group: GroupedReaction = {
  emoji: '🔥', customEmojis: {}, pubkeys: new Set(['a']), reactionIds: ['r1'], myReactionId: 'm1', count: 1, mine: true,
};

function actions(counts: GroupedReaction[]) {
  return { counts, myReactedEmojis: new Set(['🔥']), onReactionClick: vi.fn() } as unknown as MessageRowActions;
}

describe('useReactionPills', () => {
  it('hides the row with nothing to show', () => {
    const { result } = renderHook(() => useReactionPills(actions([]), null, false));
    expect(result.current.visible).toBe(false);
    expect(result.current.zap).toBeNull();
  });

  it('toggle passes the pill through to the row action', () => {
    const a = actions([group]);
    const { result } = renderHook(() => useReactionPills(a, null, true));
    expect(result.current.visible).toBe(true);
    result.current.toggle(result.current.pills[0]);
    expect(a.onReactionClick).toHaveBeenCalledWith('🔥', {}, 'm1', ['r1']);
  });
});
