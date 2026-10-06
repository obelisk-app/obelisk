import '@tests/support/game-engines';
import { describe, expect, it } from 'vitest';
import { replayLog } from '@/lib/games/session-replay';
import * as entry from '@/lib/games/session';
import { buildCreate, buildGameOp, parseGameEvent, type ParsedGameEvent } from '@/lib/games/protocol';
import { chainReaction } from '@/lib/games/chain-reaction';

function parsed(pubkey: string, at: number, id: string, template: { kind: number; content: string; tags: string[][] }): ParsedGameEvent {
  const p = parseGameEvent({ id, pubkey, created_at: at, ...template });
  if (!p) throw new Error('unparseable');
  return p;
}

describe('session-replay', () => {
  it('returns null for a log without a create', () => {
    expect(replayLog([])).toBeNull();
  });

  it('does not read the clock: the same log replays to the same table at any time', () => {
    const create = parsed('host', 1000, 'g'.repeat(64), buildCreate('ch', { game: chainReaction.type, opts: { size: 'small' }, turnTimeoutS: 0 }));
    const log = [create, parsed('b', 1001, 'j', buildGameOp('ch', create.gameId, 'join'))];
    const first = replayLog(log);
    const later = replayLog([...log].reverse());
    expect(later).toEqual(first);
    expect(first?.status).toBe('waiting');
  });

  it('a start whose seats include a bystander who never joined is ignored', () => {
    const create = parsed('host', 1000, 'g'.repeat(64), buildCreate('ch', { game: chainReaction.type, opts: { size: 'small' }, turnTimeoutS: 0 }));
    const start = parsed('host', 1002, 's', buildGameOp('ch', create.gameId, 'start', { seats: ['host', 'bystander'] }));
    expect(replayLog([create, start])?.status).toBe('waiting');
  });

  it('is what the session entry point re-exports', () => {
    expect(entry.replayLog).toBe(replayLog);
  });
});
