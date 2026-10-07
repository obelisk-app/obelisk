import { describe, expect, it } from 'vitest';
import {
  controllerOf,
  isMyTurn,
  resolveSeat,
  seatsControlledBy,
} from '@/lib/games/session/session-queries';
import type { GameSession } from '@/lib/games/session/session-types';

function table(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: 't', channelId: 'c', game: 'g', status: 'in_progress', createdBy: 'alice', createdAt: 0,
    opts: {}, turnTimeoutS: 0, minPlayers: 2, maxPlayers: 4,
    participants: ['alice', 'alice#1', 'bob'],
    seats: [{ id: 'alice', by: 'alice' }, { id: 'alice#1', by: 'alice' }, { id: 'bob', by: 'bob' }],
    joined: ['alice', 'bob'], state: null, currentTurn: 'alice#1', turnIndex: 3,
    turnStartedAt: 0, turnDeadline: null, winner: null, draw: false, eliminated: [], finishedAt: null, match: null,
    ...overrides,
  };
}

describe('session-queries', () => {
  it('resolves a named seat only when the signer controls it', () => {
    expect(resolveSeat(table(), 'alice', 'alice')).toBe('alice');
    expect(resolveSeat(table(), 'alice', 'bob')).toBeNull();
    expect(resolveSeat(table(), 'mallory')).toBeNull();
  });

  it('infers the seat: the only one held, else the one on move', () => {
    expect(resolveSeat(table(), 'bob')).toBe('bob');
    expect(resolveSeat(table(), 'alice')).toBe('alice#1');
    expect(resolveSeat(table({ currentTurn: 'bob' }), 'alice')).toBeNull();
  });

  it('answers whose move it is through the seat controller', () => {
    expect(controllerOf(table(), 'alice#1')).toBe('alice');
    expect(controllerOf(table(), 'ghost')).toBe('ghost');
    expect(isMyTurn(table(), 'alice')).toBe(true);
    expect(isMyTurn(table(), 'bob')).toBe(false);
    expect(seatsControlledBy(table(), 'alice')).toEqual(['alice', 'alice#1']);
    expect(seatsControlledBy(table(), null)).toEqual([]);
  });
});
