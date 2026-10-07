import { describe, it, expect } from 'vitest';
import { buildCreate, buildGameOp, parseGameEvent, type GameEvent } from '@/lib/games/protocol/protocol';
import { MAX_GARBAGE_LINES } from '@/lib/games/stacker/engine';
import { KIND_GAME } from '@/constants/nostr/nip-kinds';

const CH = 'channel-1';
const GAME_ID = 'g'.repeat(64);

function raw(template: { kind: number; tags: string[][] }, content: string): GameEvent {
  return { id: 'ev-1', pubkey: 'pk-a', created_at: 1000, kind: template.kind, tags: template.tags, content };
}

/**
 * What a peer can put in a number field. `JSON.stringify` refuses to write
 * `Infinity`, but `JSON.parse('1e999')` happily reads it, so these are built
 * from literal content rather than through the builders.
 */
describe('parseGameEvent and numbers a peer sends', () => {
  it('caps an attack at MAX_GARBAGE_LINES and reads 1e999 as nothing', () => {
    const op = buildGameOp(CH, GAME_ID, 'attack');
    const big = parseGameEvent(raw(op, '{"seat":"pk-a","target":"pk-b","lines":10000,"hole":3,"nonce":1}'));
    expect(big?.op).toBe('attack');
    if (big?.op !== 'attack') return;
    expect(big.lines).toBe(MAX_GARBAGE_LINES);

    const infinite = parseGameEvent(raw(op, '{"seat":"pk-a","target":"pk-b","lines":1e999,"hole":1e999,"nonce":1e999}'));
    // `lines` of Infinity means no attack at all, not an infinite one.
    expect(infinite).toBeNull();

    const holeOnly = parseGameEvent(raw(op, '{"seat":"pk-a","target":"pk-b","lines":2,"hole":1e999,"nonce":1e999}'));
    expect(holeOnly?.op).toBe('attack');
    if (holeOnly?.op !== 'attack') return;
    expect(holeOnly.hole).toBe(0);
    expect(holeOnly.nonce).toBe(0);
  });

  it('drops a checkpoint whose frame is not finite and zeroes its other counters', () => {
    const op = buildGameOp(CH, GAME_ID, 'checkpoint');
    expect(parseGameEvent(raw(op, '{"seat":"pk-a","frame":1e999}'))).toBeNull();
    const p = parseGameEvent(raw(op, '{"seat":"pk-a","frame":12.7,"attacksSent":1e999,"linesCleared":-1e999,"stackHeight":3.9}'));
    expect(p?.op).toBe('checkpoint');
    if (p?.op !== 'checkpoint') return;
    expect(p.frame).toBe(12);
    expect(p.attacksSent).toBe(0);
    expect(p.linesCleared).toBe(0);
    expect(p.stackHeight).toBe(3);
  });

  it('reads an infinite or negative turn clock as no clock', () => {
    const tpl = buildCreate(CH, { game: 'chain-reaction', turnTimeoutS: 45 });
    const infinite = parseGameEvent(raw(tpl, '{"game":"chain-reaction","turnTimeoutS":1e999}'));
    expect(infinite?.op).toBe('create');
    if (infinite?.op !== 'create') return;
    expect(infinite.turnTimeoutS).toBe(0);
    const negative = parseGameEvent(raw(tpl, '{"game":"chain-reaction","turnTimeoutS":-30}'));
    if (negative?.op !== 'create') throw new Error('expected a create');
    expect(negative.turnTimeoutS).toBe(0);
  });

  it('still refuses a non-integer turn index', () => {
    const op = buildGameOp(CH, GAME_ID, 'move');
    expect(parseGameEvent(raw(op, '{"n":1e999,"action":{}}'))).toBeNull();
    expect(parseGameEvent(raw(op, '{"n":1.5,"action":{}}'))).toBeNull();
    expect(parseGameEvent(raw({ kind: KIND_GAME, tags: op.tags }, '{"n":2,"action":{}}'))?.op).toBe('move');
  });
});
