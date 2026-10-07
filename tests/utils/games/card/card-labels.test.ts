import { describe, expect, it } from 'vitest';
import type { GameSession } from '@/lib/games/session/session';
import { translator } from '@tests/support/intl';
import { SEAT_COLORS } from '@/utils/games/chain-reaction/seat-colors';
import { cardActionLabel, cardSeatDots, cardStatus, winnerName } from '@/utils/games/card/card-labels';

const t = translator('en');

function table(over: Partial<GameSession>): GameSession {
  return {
    id: 'g1', channelId: 'c1', game: 'chain-reaction', status: 'waiting', createdBy: 'pk-host',
    minPlayers: 2, maxPlayers: 8, joined: ['pk-host'], participants: [], seats: [],
    winner: null, draw: false, ...over,
  } as unknown as GameSession;
}

describe('cardActionLabel', () => {
  it('offers to join an open table the reader is not at', () => {
    expect(cardActionLabel(t, table({}), 'pk-guest')).toBe('Join');
  });

  it('opens a table the reader already sits at, and shows a finished one\'s result', () => {
    expect(cardActionLabel(t, table({}), 'pk-host')).toBe('Open');
    expect(cardActionLabel(t, table({ status: 'finished', participants: ['pk-host'] }), 'pk-guest')).toBe('Result');
  });
});

describe('cardStatus', () => {
  it('counts the seats of an open table', () => {
    expect(cardStatus(t, table({ joined: ['a', 'b'], maxPlayers: 4 }), null)).toEqual({ text: 'Open table · 2/4', winner: null });
  });

  it('names a running, drawn or cancelled table in words', () => {
    expect(cardStatus(t, table({ status: 'in_progress' }), null).text).toBe('In progress');
    expect(cardStatus(t, table({ status: 'finished', draw: true, winner: 'a' }), null).text).toBe('Finished · draw');
    expect(cardStatus(t, table({ status: 'finished' }), null).text).toBe('Finished · draw');
    expect(cardStatus(t, table({ status: 'cancelled' }), null).text).toBe('Cancelled');
  });

  it('tells the winner they won, through the seat\'s controller', () => {
    const won = table({ status: 'finished', winner: 'pk-host#1', seats: [{ id: 'pk-host#1', by: 'pk-host' }] });
    expect(cardStatus(t, won, 'pk-host')).toEqual({ text: '🏆 you won', winner: null });
  });

  it('leaves somebody else\'s win to be named from the member list', () => {
    const won = table({ status: 'finished', winner: 'pk-b', seats: [{ id: 'pk-b', by: 'pk-b' }] });
    expect(cardStatus(t, won, 'pk-host')).toEqual({ text: null, winner: 'pk-b' });
  });
});

describe('cardSeatDots', () => {
  it('colours the joined accounts of an open table and the participants of a started one', () => {
    expect(cardSeatDots(table({ joined: ['a', 'b'] }))).toEqual([
      { pubkey: 'a', hex: SEAT_COLORS[0].hex },
      { pubkey: 'b', hex: SEAT_COLORS[1].hex },
    ]);
    expect(cardSeatDots(table({ status: 'in_progress', joined: ['a'], participants: ['x'] })).map((d) => d.pubkey)).toEqual(['x']);
  });

  it('stops at the last seat colour', () => {
    const many = Array.from({ length: SEAT_COLORS.length + 3 }, (_, i) => `pk${i}`);
    expect(cardSeatDots(table({ joined: many }))).toHaveLength(SEAT_COLORS.length);
  });
});

describe('winnerName', () => {
  const won = table({ status: 'finished', winner: 'pk-b#1', seats: [{ id: 'pk-b#1', by: 'pk-b' }] });

  it('uses the controller\'s profile name for an unlabelled seat', () => {
    expect(winnerName(won, 'pk-b#1', [{ pubkey: 'pk-b', displayName: 'Bea' }])).toBe('Bea');
  });

  it('falls back to the controller\'s key prefix, never the seat id', () => {
    expect(winnerName(won, 'pk-b#1', [{ pubkey: 'pk-b', displayName: null }])).toBe('pk-b');
    expect(winnerName(table({ seats: [] }), 'abcdef0123456789', [])).toBe('abcdef01');
  });

  it('prefers the label the table gave the seat', () => {
    const labelled = table({ seats: [{ id: 'pk-b#1', by: 'pk-b', label: 'Beto' }] });
    expect(winnerName(labelled, 'pk-b#1', [{ pubkey: 'pk-b', displayName: 'Bea' }])).toBe('Beto');
  });
});
