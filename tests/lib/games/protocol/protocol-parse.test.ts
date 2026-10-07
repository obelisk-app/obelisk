import { describe, expect, it } from 'vitest';
import { KIND_GAME } from '@/utils/nostr/nip-kinds';
import { parseGameEvent, parseSeats } from '@/lib/games/protocol/protocol-parse';
import { MAX_GARBAGE_LINES } from '@/lib/games/stacker/engine';
import * as entry from '@/lib/games/protocol/protocol';
import type { GameEvent } from '@/lib/games/protocol/protocol-types';

const TABLE = 'a'.repeat(64);

function ev(op: string, content: unknown, extraTags: string[][] = [['e', TABLE, '', 'root']]): GameEvent {
  return {
    id: 'f'.repeat(64),
    pubkey: 'b'.repeat(64),
    created_at: 1,
    kind: KIND_GAME,
    tags: [['h', 'chan'], ['op', op], ...extraTags],
    content: typeof content === 'string' ? content : JSON.stringify(content),
  };
}

describe('protocol-parse', () => {
  it('never throws on garbage content, it returns null', () => {
    expect(parseGameEvent(ev('move', '{not json'))).toBeNull();
    expect(parseGameEvent(ev('move', '[1,2]'))).toBeNull();
    expect(parseGameEvent(ev('move', 'null'))).toBeNull();
  });

  it('rejects an infinite number where one is required', () => {
    expect(parseGameEvent(ev('checkpoint', '{"frame":1e999}'))).toBeNull();
  });

  it('caps an attack at the engine\'s garbage limit', () => {
    const parsed = parseGameEvent(ev('attack', { target: 'x', lines: 10_000, hole: -3 }));
    expect(parsed).toMatchObject({ op: 'attack', lines: MAX_GARBAGE_LINES, hole: 3, nonce: 0 });
  });

  it('drops an op that names no table', () => {
    expect(parseGameEvent(ev('join', {}, []))).toBeNull();
  });

  it('reads both seat forms and drops duplicates and blanks', () => {
    expect(parseSeats(['p1', { id: 'p1#1', by: 'p1', label: 'Guest' }, 'p1', '', { id: 'x' }])).toEqual([
      { id: 'p1', by: 'p1' },
      { id: 'p1#1', by: 'p1', label: 'Guest' },
    ]);
  });

  it('is what the protocol entry point re-exports', () => {
    expect(entry.parseGameEvent).toBe(parseGameEvent);
    expect(entry.parseSeats).toBe(parseSeats);
  });
});
