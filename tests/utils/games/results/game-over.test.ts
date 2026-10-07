import '@tests/support/game-engines';
import { describe, expect, it } from 'vitest';
import { deriveSession, type GameSession } from '@/lib/games/session/session';
import { buildCreate, buildGameOp, parseGameEvent, type GameEvent, type ParsedGameEvent } from '@/lib/games/protocol/protocol';
import { SEAT_COLORS } from '@/components/games/chain-reaction/seat-colors';
import { gameOverView, LOSER_HEX, NEUTRAL_HEX, resultKeyOf } from '@/utils/games/results/game-over';

const CH = 'channel-1';
const HOST = 'pk-host';
const B = 'pk-b';
const ID = 'a'.repeat(64);

function parsed(id: string, pubkey: string, at: number, t: { kind: number; content: string; tags: string[][] }): ParsedGameEvent {
  const p = parseGameEvent({ id, pubkey, created_at: at, kind: t.kind, tags: t.tags, content: t.content } as GameEvent);
  if (!p) throw new Error('unparseable');
  return p;
}

/** The host resigned, so B took the board. */
function finished(): GameSession {
  return deriveSession([
    parsed(ID, HOST, 1000, buildCreate(CH, { game: 'chain-reaction', opts: { size: 'small' }, turnTimeoutS: 45 })),
    parsed('j1', B, 1001, buildGameOp(CH, ID, 'join')),
    parsed('s1', HOST, 1002, buildGameOp(CH, ID, 'start', { seats: [HOST, B] })),
    parsed('r1', HOST, 1010, buildGameOp(CH, ID, 'resign')),
  ], 1020)!;
}

describe('gameOverView', () => {
  it('tells the winner they won, in their seat colour, with their score', () => {
    const view = gameOverView(finished(), B);
    expect(view).toMatchObject({ winner: B, draw: false, iWon: true, iLost: false, headlineKey: 'games.overlay.youWon' });
    expect(view.color).toBe(SEAT_COLORS[1].hex);
    expect(view.myScore).not.toBeNull();
  });

  it('tells a player who did not win that they lost, in red', () => {
    expect(gameOverView(finished(), HOST)).toMatchObject({ iWon: false, iLost: true, color: LOSER_HEX, headlineKey: 'games.overlay.youLost' });
  });

  it('gives a spectator a neutral headline and no score', () => {
    expect(gameOverView(finished(), 'pk-nobody')).toMatchObject({ iWon: false, iLost: false, myScore: null, headlineKey: 'games.overlay.over' });
    expect(gameOverView(finished(), null).headlineKey).toBe('games.overlay.over');
  });

  it('reads a draw before anything else, in the neutral colour', () => {
    const drawn: GameSession = { ...finished(), winner: null, draw: true };
    expect(gameOverView(drawn, B)).toMatchObject({ draw: true, headlineKey: 'games.overlay.draw' });
    expect(gameOverView(drawn, 'pk-nobody').color).toBe(NEUTRAL_HEX);
  });

  it('counts a win on any seat the viewer holds', () => {
    const hot: GameSession = { ...finished(), winner: `${HOST}#1`, seats: [{ id: HOST, by: HOST }, { id: `${HOST}#1`, by: HOST }] };
    expect(gameOverView(hot, HOST).iWon).toBe(true);
  });
});

describe('resultKeyOf', () => {
  it('keys a result by table and finish time, so a rematch is a new result', () => {
    const s = finished();
    expect(resultKeyOf(s)).toBe(`${ID}:${s.finishedAt}`);
    expect(resultKeyOf({ ...s, finishedAt: null })).toBe(`${ID}:`);
  });
});
