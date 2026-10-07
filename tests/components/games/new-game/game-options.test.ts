import { describe, expect, it } from 'vitest';
import { gameCatalog, type GameInfo } from '@/lib/games/core/catalog';
import { gameCreateOptions, localPlayerChoices, TIMEOUTS } from '@/components/games/new-game/game-options';

const info = (type: string): GameInfo => gameCatalog().find((g) => g.type === type)!;

describe('gameCreateOptions', () => {
  const base = { resume: null, seed: '123', size: 'large' as const };

  it('sends the board size for Chain Reaction', () => {
    expect(gameCreateOptions('chain-reaction', base)).toEqual({ size: 'large' });
  });

  it('sends a seed for Stacker and a fresh Vesta board', () => {
    expect(gameCreateOptions('stacker', base)).toHaveProperty('seed');
    expect(gameCreateOptions('vesta', base)).toHaveProperty('seed');
  });

  it('sends the save instead of a seed when resuming Vesta', () => {
    const resume = { data: { saved: true }, players: 3, name: 'x.json' };
    expect(gameCreateOptions('vesta', { ...base, resume })).toEqual({ resume: { saved: true } });
  });
});

describe('localPlayerChoices', () => {
  it('offers every legal count for a turn-based game', () => {
    const cr = info('chain-reaction');
    const choices = localPlayerChoices(cr);
    expect(choices[0]).toBe(cr.minPlayers);
    expect(choices[choices.length - 1]).toBe(cr.maxPlayers);
  });

  it('offers only a solo run for a real-time game', () => {
    expect(localPlayerChoices(info('stacker'))).toEqual([1]);
  });
});

it('starts the clock list with no clock', () => {
  expect(TIMEOUTS[0]).toEqual({ label: null, seconds: 0 });
});
