import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/games/standings', () => ({
  standingsFor: () => [
    { seat: 'b', score: '10', detail: 'winner' },
    { seat: 'a', score: '3' },
    { seat: 'ghost', score: '0' },
  ],
}));

import { rowsFor } from '@/components/chat/games/results-rows';
import { SEAT_COLORS } from '@/components/chat/games/ChainReactionBoard';
import { VESTA_PLAYER_COLORS } from '@/components/chat/games/vesta/VestaBoard';
import type { GameSession } from '@/lib/games/session';

const session = (game: string) => ({ game, participants: ['a', 'b'] }) as unknown as GameSession;

describe('rowsFor', () => {
  it('paints each standing in its seat colour', () => {
    const rows = rowsFor(session('chain-reaction'));
    expect(rows[0]).toEqual({ seat: 'b', score: '10', detail: 'winner', color: SEAT_COLORS[1].hex });
    expect(rows[1].color).toBe(SEAT_COLORS[0].hex);
  });

  it('uses the Vesta palette for Vesta', () => {
    expect(rowsFor(session('vesta'))[1].color).toBe(VESTA_PLAYER_COLORS[0]);
  });

  it('greys out a seat that is not at the table', () => {
    expect(rowsFor(session('chain-reaction'))[2].color).toBe('#a3a3a3');
  });
});
