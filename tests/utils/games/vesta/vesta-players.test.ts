import { describe, expect, it } from 'vitest';
import { createGame, type GameState } from 'vesta';
import { handSize, playerTiles, vestaStatus } from '@/utils/games/vesta/vesta-players';

function withResources(state: GameState, i: number, resources: Partial<Record<string, number>>): GameState {
  return { ...state, players: state.players.map((p, j) => (j === i ? { ...p, resources: { ...p.resources, ...resources } } : p)) };
}

describe('handSize', () => {
  it('adds up the five resources, missing ones as zero', () => {
    expect(handSize({ brick: 2, ore: 3 })).toBe(5);
    expect(handSize({})).toBe(0);
  });
});

describe('playerTiles', () => {
  const state = withResources(createGame({ players: 3, roll: 1 }), 0, { brick: 2, lumber: 1, wool: 0, grain: 0, ore: 0 });

  it('shows my cards and only a count for the others', () => {
    const others = withResources(state, 1, { brick: 1, lumber: 1, wool: 1, grain: 1, ore: 0 });
    const tiles = playerTiles(['a', 'b', 'c'], others.players, 1, ['a']);
    expect(tiles[0]).toMatchObject({ seat: 'a', index: 0, mine: true, onMove: false, cards: '🧱2 🪵1 🐑0 🌾0 🪨0' });
    expect(tiles[1]).toMatchObject({ seat: 'b', mine: false, onMove: true, cards: '🎴 4' });
  });

  it('skips a seat the state has no player for', () => {
    expect(playerTiles(['a', 'b', 'c', 'd'], state.players, 0, []).map((t) => t.seat)).toEqual(['a', 'b', 'c']);
  });
});

describe('vestaStatus', () => {
  const base = { winner: null, setupStep: 'settlement', dice: null } as unknown as Pick<GameState, 'winner' | 'setupStep' | 'dice'>;

  it('names the winner first', () => {
    expect(vestaStatus({ ...base, winner: 1 }, ['a', 'b'], 'a', true)).toEqual({ kind: 'won', seat: 'b' });
  });

  it('then the setup step', () => {
    expect(vestaStatus(base, ['a'], 'a', true)).toEqual({ kind: 'setup', step: 'settlement', seat: 'a' });
    expect(vestaStatus({ ...base, setupStep: 'road' } as typeof base, ['a'], null, true)).toEqual({ kind: 'setup', step: 'road', seat: '' });
  });

  it('then the dice, then who is to roll', () => {
    expect(vestaStatus({ ...base, dice: [3, 4] } as typeof base, ['a'], 'a', false)).toEqual({ kind: 'dice', dice: [3, 4], total: 7 });
    expect(vestaStatus(base, ['a'], 'a', false)).toEqual({ kind: 'roll', seat: 'a' });
  });
});
