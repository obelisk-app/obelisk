import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ingestGameEvent, ingestGameEvents, flushGameIngest, resetGameIngest, setGameIngestListener, INGEST_BATCH_MS } from './ingest';
import { useGamesStore } from '@/store/games';
import { buildCreate, buildGameOp, parseGameEvent, type GameEvent, type ParsedGameEvent } from './protocol';
import { chainReaction } from './chain-reaction';

const CH = 'channel-1';
const HOST = 'pk-host';

function parsed(id: string, at: number, template: { kind: number; content: string; tags: string[][] }): ParsedGameEvent {
  const ev: GameEvent = { id, pubkey: HOST, created_at: at, kind: template.kind, tags: template.tags, content: template.content };
  const p = parseGameEvent(ev);
  if (!p) throw new Error('unparseable');
  return p;
}

const create = (id: string) => parsed(id, 1000, buildCreate(CH, { game: chainReaction.type, turnTimeoutS: 45 }));
const join = (id: string, gameId: string) => parsed(id, 1001, buildGameOp(CH, gameId, 'join'));

describe('game ingest batching', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetGameIngest();
    setGameIngestListener(null);
    useGamesStore.getState().reset();
  });

  afterEach(() => {
    resetGameIngest();
    setGameIngestListener(null);
    vi.useRealTimers();
  });

  it('lands a burst as one store update', () => {
    let notifications = 0;
    const unsub = useGamesStore.subscribe(() => { notifications += 1; });

    ingestGameEvent(create('g1'));
    ingestGameEvent(join('j1', 'g1'));
    ingestGameEvent(join('j2', 'g1'));
    // Nothing has reached the store yet — that is the point.
    expect(useGamesStore.getState().logs.g1).toBeUndefined();
    expect(notifications).toBe(0);

    vi.advanceTimersByTime(INGEST_BATCH_MS);
    unsub();

    expect(useGamesStore.getState().logs.g1).toHaveLength(3);
    expect(notifications).toBe(1);
  });

  it('keeps accumulating into the same batch until it fires', () => {
    ingestGameEvent(create('g1'));
    vi.advanceTimersByTime(INGEST_BATCH_MS - 1);
    ingestGameEvent(join('j1', 'g1'));
    vi.advanceTimersByTime(1);
    expect(useGamesStore.getState().logs.g1).toHaveLength(2);
  });

  it('starts a new batch after a flush', () => {
    ingestGameEvent(create('g1'));
    vi.advanceTimersByTime(INGEST_BATCH_MS);
    ingestGameEvent(join('j1', 'g1'));
    expect(useGamesStore.getState().logs.g1).toHaveLength(1);
    vi.advanceTimersByTime(INGEST_BATCH_MS);
    expect(useGamesStore.getState().logs.g1).toHaveLength(2);
  });

  it('flushes on demand without waiting for the timer', () => {
    ingestGameEvents([create('g1'), join('j1', 'g1')]);
    flushGameIngest();
    expect(useGamesStore.getState().logs.g1).toHaveLength(2);
    // And the timer it cancelled does not fire a second, empty batch.
    let notifications = 0;
    const unsub = useGamesStore.subscribe(() => { notifications += 1; });
    vi.advanceTimersByTime(INGEST_BATCH_MS * 2);
    unsub();
    expect(notifications).toBe(0);
  });

  it('tells the listener which tables a batch touched, deduped', () => {
    const touched = vi.fn();
    setGameIngestListener(touched);
    ingestGameEvents([create('g1'), join('j1', 'g1'), create('g2')]);
    vi.advanceTimersByTime(INGEST_BATCH_MS);
    expect(touched).toHaveBeenCalledTimes(1);
    expect([...touched.mock.calls[0][0]].sort()).toEqual(['g1', 'g2']);
  });

  it('drops a pending batch on reset', () => {
    ingestGameEvent(create('g1'));
    resetGameIngest();
    vi.advanceTimersByTime(INGEST_BATCH_MS * 2);
    expect(useGamesStore.getState().logs.g1).toBeUndefined();
  });

  it('ignores an empty ingestGameEvents call', () => {
    ingestGameEvents([]);
    vi.advanceTimersByTime(INGEST_BATCH_MS);
    expect(Object.keys(useGamesStore.getState().logs)).toHaveLength(0);
  });
});
