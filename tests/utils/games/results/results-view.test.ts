import '@tests/support/game-engines';
import { describe, expect, it } from 'vitest';
import { deriveSession, type GameSession } from '@/lib/games/session/session';
import { buildCreate, buildGameOp, parseGameEvent, type GameEvent, type ParsedGameEvent } from '@/lib/games/protocol/protocol';
import { resultRows } from '@/utils/games/results/results-view';

const CH = 'channel-1';
const A = 'pk-ana';
const B = 'pk-bruno';
const ID = 'c'.repeat(64);

function parsed(id: string, pubkey: string, at: number, t: { kind: number; content: string; tags: string[][] }): ParsedGameEvent {
  const p = parseGameEvent({ id, pubkey, created_at: at, kind: t.kind, tags: t.tags, content: t.content } as GameEvent);
  if (!p) throw new Error('unparseable');
  return p;
}

function finished(): GameSession {
  return deriveSession([
    parsed(ID, A, 1000, buildCreate(CH, { game: 'chain-reaction', opts: { size: 'small' }, turnTimeoutS: 0 })),
    parsed('j1', B, 1001, buildGameOp(CH, ID, 'join')),
    parsed('s1', A, 1002, buildGameOp(CH, ID, 'start', { seats: [{ id: A, by: A }, { id: B, by: B }] })),
    parsed('m1', A, 1003, buildGameOp(CH, ID, 'move', { n: 0, seat: A, action: { cell: 0 } })),
    parsed('r1', A, 1004, buildGameOp(CH, ID, 'resign', { seat: A })),
  ], 2000)!;
}

describe('resultRows', () => {
  it('marks the winner and the viewer\'s own seat', () => {
    const rows = resultRows(finished(), A);
    expect(rows.map((r) => [r.seat, r.isWinner, r.mine])).toEqual(
      expect.arrayContaining([[A, false, true], [B, true, false]]),
    );
    expect(rows.every((r) => typeof r.color === 'string')).toBe(true);
  });

  it('marks nothing as a spectator\'s', () => {
    expect(resultRows(finished(), null).some((r) => r.mine)).toBe(false);
  });
});
