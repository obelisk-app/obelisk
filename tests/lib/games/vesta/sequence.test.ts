import { describe, expect, it } from 'vitest';
import { createGame, type GameState } from 'vesta';
import { flags, isRobberPending, isStealPending, sequence } from '@/lib/games/vesta/sequence';
import type { VestaAction } from '@/lib/games/vesta/moves';
import * as entry from '@/lib/games/vesta/definition';

const board = (): GameState => ({ ...createGame({ players: 2, roll: 42 }), phase: 'play' } as GameState);

describe('vesta sequence', () => {
  it('a seven sends the robber, anything else does not', () => {
    const before = board();
    const seven = sequence({ ...before, dice: [3, 4] } as GameState, before, { type: 'roll-dice' } as VestaAction, 0);
    const eight = sequence({ ...before, dice: [4, 4] } as GameState, before, { type: 'roll-dice' } as VestaAction, 0);
    expect(isRobberPending(seven)).toBe(true);
    expect(isRobberPending(eight)).toBe(false);
  });

  it('moving the robber leaves a steal to resolve, and ending the turn clears both', () => {
    const before = board();
    const moved = sequence(before, before, { type: 'move-robber', q: 0, r: 0 } as unknown as VestaAction, 0);
    expect(isStealPending(moved)).toBe(true);
    const ended = sequence(moved, moved, { type: 'end-turn' } as VestaAction, 0);
    expect(flags(ended)).toEqual({});
  });

  it('is what the definition entry point re-exports', () => {
    expect(entry.isRobberPending).toBe(isRobberPending);
    expect(entry.isStealPending).toBe(isStealPending);
  });
});
