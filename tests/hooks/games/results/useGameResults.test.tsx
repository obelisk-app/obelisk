import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import type { GameSession } from '@/lib/games/session/session';
import { useGameResults } from '@/hooks/games/results/useGameResults';

const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;
const label = (seat: string) => `L-${seat}`;

function session(over: Partial<GameSession>): GameSession {
  return {
    id: 'g1', game: 'stacker', status: 'finished', winner: null, draw: false,
    participants: ['pk-a', 'pk-b'], seats: [{ id: 'pk-a', by: 'pk-a' }, { id: 'pk-b', by: 'pk-b' }],
    state: null, match: null, eliminated: [], ...over,
  } as unknown as GameSession;
}

const mount = (s: GameSession, me: string | null = null) => renderHook(() => useGameResults(s, label, me), { wrapper }).result.current;

describe('useGameResults', () => {
  it('names the winner by their seat label', () => {
    expect(mount(session({ winner: 'pk-b' })).outcome).toBe('L-pk-b won');
  });

  it('says draw when nobody took it, and simply over for a solo run', () => {
    expect(mount(session({ draw: true })).outcome).toBe('draw');
    expect(mount(session({ participants: ['pk-a'], seats: [{ id: 'pk-a', by: 'pk-a' }] })).outcome).toBe('game over');
  });

  it('marks the viewer\'s rows', () => {
    const { rows } = mount(session({ winner: 'pk-b' }), 'pk-a');
    expect(rows.find((r) => r.seat === 'pk-a')?.mine).toBe(true);
    expect(rows.find((r) => r.seat === 'pk-b')?.isWinner).toBe(true);
  });
});
