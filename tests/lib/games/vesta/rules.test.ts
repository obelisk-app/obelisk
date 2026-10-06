import { describe, expect, it } from 'vitest';
import { createGame, type GameState } from 'vesta';
import { dryRun } from '@/lib/games/vesta/rules';
import type { VestaAction } from '@/lib/games/vesta/moves';

const SEATS = ['a', 'b'];
const setup = (): GameState => createGame({ players: 2, roll: 42 });
const play = (rolled: boolean): GameState => ({ ...setup(), phase: 'play', rolled } as GameState);

describe('vesta rules', () => {
  it('refuses a seat that is not at the table', () => {
    expect(dryRun(setup(), { type: 'end-turn' } as VestaAction, 'z', SEATS)).toEqual({ ok: false, error: 'Not seated at this table' });
  });

  it('no rolling during setup, and no second roll', () => {
    expect(dryRun(setup(), { type: 'roll-dice' } as VestaAction, 'a', SEATS).ok).toBe(false);
    expect(dryRun(play(true), { type: 'roll-dice' } as VestaAction, 'a', SEATS)).toEqual({ ok: false, error: 'Already rolled this turn' });
  });

  it('the robber only moves when something sent it', () => {
    const res = dryRun(play(true), { type: 'move-robber', q: 1, r: 1 } as unknown as VestaAction, 'a', SEATS);
    expect(res).toEqual({ ok: false, error: 'Nothing has sent the robber' });
  });

  it('a turn cannot end before the roll', () => {
    expect(dryRun(play(false), { type: 'end-turn' } as VestaAction, 'a', SEATS)).toEqual({ ok: false, error: 'Roll before ending your turn' });
  });
});
