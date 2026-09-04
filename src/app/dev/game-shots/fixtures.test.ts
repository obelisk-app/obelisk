import { describe, it, expect } from 'vitest';
import type { GameState as VestaState } from 'vesta';
import type { CRState } from '@/lib/games/chain-reaction';
import {
  chainReactionFixture,
  vestaFixture,
  stackerFixture,
  finishedChainReaction,
  seatLabel,
} from './fixtures';

/**
 * The guide screenshots are only worth anything if the boards behind them are
 * boards the engine actually produced. These assertions are the difference
 * between "a picture of Obelisk" and "a picture".
 */
describe('guide screenshot fixtures', () => {
  it('chain reaction: a contested mid-game board, still in progress', () => {
    const session = chainReactionFixture();
    expect(session.game).toBe('chain-reaction');
    expect(session.status).toBe('in_progress');
    expect(session.participants).toHaveLength(3);

    const state = session.state as CRState;
    const owned = state.cells.filter((c) => c.owner !== null);
    expect(owned.length).toBeGreaterThan(10);
    // More than one seat on the board, or the picture is a solo game.
    expect(new Set(owned.map((c) => c.owner)).size).toBeGreaterThan(1);
  });

  it('chain reaction is deterministic — the same log every run', () => {
    expect(chainReactionFixture().state).toEqual(chainReactionFixture().state);
  });

  it('vesta: past the setup snake with settlements and roads down', () => {
    const session = vestaFixture();
    const state = session.state as VestaState;
    expect(state.phase).toBe('play');
    const settlements = state.players.reduce((n, p) => n + p.settlements.length, 0);
    expect(settlements).toBe(6); // three seats × two each
    expect(state.players.some((p) => p.roads.length > 0)).toBe(true);
  });

  it('stacker: a live match with opponents, boards and garbage in flight', () => {
    const { session, match } = stackerFixture();
    expect(session.game).toBe('stacker');
    expect(match.seats).toHaveLength(3);
    expect(match.attacks.length).toBeGreaterThan(0);
    // Opponent wells arrive as encoded boards; an empty one draws as nothing.
    const boards = Object.values(match.progress).map((p) => p.board);
    expect(boards.every((b) => typeof b === 'string' && b.length > 0)).toBe(true);
    expect(boards.some((b) => /[1-8]/.test(b!))).toBe(true);
  });

  it('a finished table has a result to render', () => {
    const session = finishedChainReaction();
    expect(session.status).toBe('finished');
    expect(session.winner || session.draw).toBeTruthy();
  });

  it('labels seats by name, not by pubkey', () => {
    expect(seatLabel('seat-ana')).toBe('Ana');
  });
});
