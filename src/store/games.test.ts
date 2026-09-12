import { describe, it, expect, beforeEach } from 'vitest';
import { useGamesStore, selectSession, selectChannelSessions } from './games';
import { buildCreate, buildGameOp, parseGameEvent, type GameEvent, type ParsedGameEvent } from '@/lib/games/protocol';
import { chainReaction } from '@/lib/games/chain-reaction';

const CH = 'channel-1';
const OTHER = 'channel-2';
const HOST = 'pk-host';
const B = 'pk-b';

function parsed(id: string, pubkey: string, createdAt: number, template: { kind: number; content: string; tags: string[][] }): ParsedGameEvent {
  const ev: GameEvent = { id, pubkey, created_at: createdAt, kind: template.kind, tags: template.tags, content: template.content };
  const p = parseGameEvent(ev);
  if (!p) throw new Error('unparseable');
  return p;
}

const create = (channel: string, id: string, at = 1000) =>
  parsed(id, HOST, at, buildCreate(channel, { game: chainReaction.type, turnTimeoutS: 45 }));

describe('games store', () => {
  beforeEach(() => {
    // `reset()`, not `setState` — the dedupe index is module state, and a bare
    // setState would leave it populated, so the next test's ingest of the same
    // ids would be a silent no-op.
    useGamesStore.getState().reset();
  });

  it('ingests an event and maps the table to its channel', () => {
    useGamesStore.getState().ingest(create(CH, 'g1'));
    const s = useGamesStore.getState();
    expect(s.logs.g1).toHaveLength(1);
    expect(s.channelOf.g1).toBe(CH);
  });

  it('drops duplicate ids — relays re-deliver on reconnect', () => {
    const ev = create(CH, 'g1');
    useGamesStore.getState().ingestMany([ev, ev, ev]);
    expect(useGamesStore.getState().logs.g1).toHaveLength(1);
  });

  it('keeps the same object identity when nothing new arrived', () => {
    const ev = create(CH, 'g1');
    useGamesStore.getState().ingest(ev);
    const before = useGamesStore.getState().logs;
    useGamesStore.getState().ingest(ev);
    expect(useGamesStore.getState().logs).toBe(before);
  });

  it('derives a session from the stored log', () => {
    useGamesStore.getState().ingestMany([
      create(CH, 'g1'),
      parsed('j1', B, 1001, buildGameOp(CH, 'g1', 'join')),
      parsed('s1', HOST, 1002, buildGameOp(CH, 'g1', 'start', { seats: [HOST, B] })),
    ]);
    const session = selectSession(useGamesStore.getState(), 'g1', 1010)!;
    expect(session.status).toBe('in_progress');
    expect(session.participants).toEqual([HOST, B]);
  });

  it('returns null for a table whose create has not arrived yet', () => {
    useGamesStore.getState().ingest(parsed('j1', B, 1001, buildGameOp(CH, 'orphan', 'join')));
    expect(selectSession(useGamesStore.getState(), 'orphan', 1010)).toBeNull();
  });

  it('lists a channel\'s tables newest first, and only that channel\'s', () => {
    useGamesStore.getState().ingestMany([
      create(CH, 'g1', 1000),
      create(CH, 'g2', 2000),
      create(OTHER, 'g3', 3000),
    ]);
    const list = selectChannelSessions(useGamesStore.getState(), CH, 3100);
    expect(list.map((s) => s.id)).toEqual(['g2', 'g1']);
  });

  it('clearChannel drops only that channel\'s tables', () => {
    useGamesStore.getState().ingestMany([create(CH, 'g1'), create(OTHER, 'g3')]);
    useGamesStore.getState().clearChannel(CH);
    const s = useGamesStore.getState();
    expect(s.logs.g1).toBeUndefined();
    expect(s.logs.g3).toBeDefined();
  });

  it('clearChannel lets the channel be re-ingested afterwards', () => {
    useGamesStore.getState().ingestMany([create(CH, 'g1')]);
    useGamesStore.getState().clearChannel(CH);
    useGamesStore.getState().ingestMany([create(CH, 'g1')]);
    expect(useGamesStore.getState().logs.g1).toHaveLength(1);
  });

  describe('batched ingest', () => {
    const bigBatch = (n: number) => [
      create(CH, 'g1'),
      create(OTHER, 'g2'),
      ...Array.from({ length: n }, (_, i) =>
        parsed(`j${i}`, `pk-${i}`, 1001 + i, buildGameOp(CH, 'g1', 'join'))),
    ];

    it('copies each touched log once, whatever the batch size', () => {
      const batch = bigBatch(300);
      const before = useGamesStore.getState().logs;
      useGamesStore.getState().ingestMany(batch);
      const after = useGamesStore.getState().logs;
      expect(after).not.toBe(before);
      expect(after.g1).toHaveLength(301);
      expect(after.g2).toHaveLength(1);
    });

    it('notifies subscribers once for a whole batch', () => {
      let notifications = 0;
      const unsub = useGamesStore.subscribe(() => { notifications += 1; });
      useGamesStore.getState().ingestMany(bigBatch(300));
      unsub();
      expect(notifications).toBe(1);
    });

    it('re-ingesting the same batch changes nothing', () => {
      const batch = bigBatch(50);
      useGamesStore.getState().ingestMany(batch);
      const before = useGamesStore.getState().logs;
      useGamesStore.getState().ingestMany(batch);
      expect(useGamesStore.getState().logs).toBe(before);
    });
  });

  describe('replay cache', () => {
    const seed = () => useGamesStore.getState().ingestMany([
      create(CH, 'g1'),
      parsed('j1', B, 1001, buildGameOp(CH, 'g1', 'join')),
      parsed('s1', HOST, 1002, buildGameOp(CH, 'g1', 'start', { seats: [HOST, B] })),
    ]);

    it('returns the identical session until the log changes', () => {
      seed();
      const first = selectSession(useGamesStore.getState(), 'g1', 1010);
      expect(selectSession(useGamesStore.getState(), 'g1', 1010)).toBe(first);
      // A different clock reading must not re-derive a table that has started.
      expect(selectSession(useGamesStore.getState(), 'g1', 99_999)).toBe(first);
    });

    it('re-derives once the log grows, and not before', () => {
      seed();
      const before = selectSession(useGamesStore.getState(), 'g1', 1010);
      useGamesStore.getState().ingest(parsed('j1', B, 1001, buildGameOp(CH, 'g1', 'join')));
      expect(selectSession(useGamesStore.getState(), 'g1', 1010)).toBe(before);
      useGamesStore.getState().ingest(
        parsed('m1', HOST, 1003, buildGameOp(CH, 'g1', 'move', { n: 0, action: { cell: 0 } })),
      );
      const after = selectSession(useGamesStore.getState(), 'g1', 1010);
      expect(after).not.toBe(before);
      expect(after!.turnIndex).toBe(1);
    });

    it('keeps a stale waiting table\'s cancelled session stable across ticks', () => {
      useGamesStore.getState().ingest(create(CH, 'g9', 1000));
      const expired = selectSession(useGamesStore.getState(), 'g9', 1000 + 3601);
      expect(expired!.status).toBe('cancelled');
      expect(selectSession(useGamesStore.getState(), 'g9', 1000 + 4000)).toBe(expired);
      // And the underlying replay is untouched — it is shared with every other
      // reader, including ones on an earlier clock.
      expect(selectSession(useGamesStore.getState(), 'g9', 1000 + 10)!.status).toBe('waiting');
    });
  });

  it('reset drops the logs and the dedupe index together', () => {
    useGamesStore.getState().ingest(create(CH, 'g1'));
    useGamesStore.getState().reset();
    expect(useGamesStore.getState().logs.g1).toBeUndefined();
    useGamesStore.getState().ingest(create(CH, 'g1'));
    expect(useGamesStore.getState().logs.g1).toHaveLength(1);
  });

  it('tracks which table the modal has open', () => {
    useGamesStore.getState().setOpenGame('g1');
    expect(useGamesStore.getState().openGameId).toBe('g1');
    useGamesStore.getState().setOpenGame(null);
    expect(useGamesStore.getState().openGameId).toBeNull();
  });
});
