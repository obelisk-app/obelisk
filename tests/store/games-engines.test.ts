import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

/**
 * Game engines download on demand (`src/lib/games/registry.ts`). Vesta's
 * download is held open here until the test releases it, to pin what the
 * store does meanwhile: a table of that game reads as "not yet" (the card's
 * skeleton), events keep landing in its log, nothing malformed or unknown
 * throws, and the table appears, complete, the moment the rules arrive.
 */
const gate = vi.hoisted(() => {
  let open: () => void = () => {};
  const promise = new Promise<void>((resolve) => { open = resolve; });
  return { promise, open: () => open(), evaluated: 0 };
});
vi.mock('@/lib/games/vesta/definition', async (importOriginal) => {
  await gate.promise;
  gate.evaluated++;
  return importOriginal();
});

import { useGamesStore, selectSession, selectChannelSessions } from '@/store/games';
import { useGameSession } from '@/hooks/chat/useChannelGames';
import { buildCreate, buildGameOp, parseGameEvent, type GameEvent, type ParsedGameEvent } from '@/lib/games/protocol';
import { getGameDef } from '@/lib/games/registry';

const CH = 'channel-1';
const HOST = 'pk-host';
const B = 'pk-b';
const C = 'pk-c';
const VESTA_TABLE = 'a'.repeat(64);
const CHESS_TABLE = 'b'.repeat(64);
const CTOR_TABLE = 'c'.repeat(64);

function parsed(id: string, pubkey: string, createdAt: number, template: { kind: number; content: string; tags: string[][] }): ParsedGameEvent {
  const ev: GameEvent = { id, pubkey, created_at: createdAt, kind: template.kind, tags: template.tags, content: template.content };
  const p = parseGameEvent(ev);
  if (!p) throw new Error('unparseable');
  return p;
}

const now = Math.floor(Date.now() / 1000);

describe('games store while an engine downloads', () => {
  it('reads "not yet", keeps ingesting, handles the unknown safely, then replays everything once the rules land', async () => {
    useGamesStore.getState().reset();
    useGamesStore.getState().ingestMany([
      parsed(VESTA_TABLE, HOST, now - 10, buildCreate(CH, { game: 'vesta', turnTimeoutS: 0 })),
      parsed('j1', B, now - 9, buildGameOp(CH, VESTA_TABLE, 'join')),
      // Games this client cannot play, one named after a key every object has.
      parsed(CHESS_TABLE, HOST, now - 8, buildCreate(CH, { game: 'chess', turnTimeoutS: 0 })),
      parsed(CTOR_TABLE, HOST, now - 8, buildCreate(CH, { game: 'constructor', turnTimeoutS: 0 })),
    ]);

    const hook = renderHook(() => useGameSession(VESTA_TABLE));
    expect(hook.result.current).toBeNull();
    expect(selectSession(useGamesStore.getState(), VESTA_TABLE)).toBeNull();
    expect(selectSession(useGamesStore.getState(), CHESS_TABLE)).toBeNull();
    expect(selectSession(useGamesStore.getState(), CTOR_TABLE)).toBeNull();
    expect(selectChannelSessions(useGamesStore.getState(), CH)).toEqual([]);
    expect(getGameDef('vesta')).toBeNull();

    // The table goes on while its rules download: a join, the start, and a
    // move no engine would accept, all before the engine exists.
    act(() => {
      useGamesStore.getState().ingestMany([
        parsed('j2', C, now - 7, buildGameOp(CH, VESTA_TABLE, 'join')),
        parsed('s1', HOST, now - 6, buildGameOp(CH, VESTA_TABLE, 'start', { seats: [HOST, B, C] })),
        parsed('m1', HOST, now - 5, buildGameOp(CH, VESTA_TABLE, 'move', { n: 0, action: { type: 'build-city', vertex: 'nowhere' } })),
      ]);
    });
    expect(hook.result.current).toBeNull();
    expect(gate.evaluated).toBe(0);

    await act(async () => {
      gate.open();
      await vi.waitFor(() => expect(useGamesStore.getState().enginesLoaded).toBeGreaterThan(0));
    });
    expect(gate.evaluated).toBe(1);

    const session = hook.result.current;
    expect(session).not.toBeNull();
    expect(session!.game).toBe('vesta');
    expect(session!.status).toBe('in_progress');
    expect(session!.participants).toEqual([HOST, B, C]);
    // The malformed move was dropped by the engine, not applied, not thrown.
    expect(session!.turnIndex).toBe(0);
    expect(selectSession(useGamesStore.getState(), VESTA_TABLE)).toBe(session);

    // The unknown games stay null for good and never fetch anything.
    expect(selectSession(useGamesStore.getState(), CHESS_TABLE)).toBeNull();
    expect(selectSession(useGamesStore.getState(), CTOR_TABLE)).toBeNull();
    expect(selectChannelSessions(useGamesStore.getState(), CH).map((s) => s.id)).toEqual([VESTA_TABLE]);
    hook.unmount();
  });
});
