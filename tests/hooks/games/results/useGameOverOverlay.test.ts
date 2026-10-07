import { act, renderHook } from '@testing-library/react';
import type { MouseEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { GameSession } from '@/lib/games/session/session';
import { useGameOverOverlay } from '@/hooks/games/results/useGameOverOverlay';

const WINNER = 'pk-b';
function session(over: Partial<GameSession> = {}): GameSession {
  return {
    id: 'g1', status: 'finished', finishedAt: 1010, winner: WINNER, draw: false,
    participants: ['pk-a', WINNER], seats: [{ id: 'pk-a', by: 'pk-a' }, { id: WINNER, by: WINNER }],
    game: 'chain-reaction', state: null, match: null, eliminated: [], ...over,
  } as unknown as GameSession;
}

describe('useGameOverOverlay', () => {
  it('shows nothing until the table is finished', () => {
    const { result } = renderHook(() => useGameOverOverlay(session({ status: 'in_progress' }), WINNER, vi.fn()));
    expect(result.current.view).toBeNull();
  });

  it('reads the result for the viewer', () => {
    const { result } = renderHook(() => useGameOverOverlay(session(), WINNER, vi.fn()));
    expect(result.current.view).toMatchObject({ iWon: true, headlineKey: 'games.overlay.youWon' });
  });

  it('dismisses once and calls back', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useGameOverOverlay(session(), WINNER, onClose));
    act(() => result.current.dismiss());
    expect(result.current.view).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the close button\'s click off the backdrop', () => {
    const onClose = vi.fn();
    const stopPropagation = vi.fn();
    const { result } = renderHook(() => useGameOverOverlay(session(), WINNER, onClose));
    act(() => result.current.dismissFromButton({ stopPropagation } as unknown as MouseEvent));
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('re-arms for a later result on the same table', () => {
    const { result, rerender } = renderHook(({ s }) => useGameOverOverlay(s, WINNER, vi.fn()), { initialProps: { s: session() } });
    act(() => result.current.dismiss());
    rerender({ s: session() });
    expect(result.current.view).toBeNull();
    rerender({ s: session({ finishedAt: 2020 }) });
    expect(result.current.view).not.toBeNull();
  });
});
