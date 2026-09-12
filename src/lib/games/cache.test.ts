import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const bridge = vi.hoisted(() => ({
  pubkey: 'pk-me' as string | null,
  relay: 'wss://relay.test' as string,
  present: true,
}));

vi.mock('@/lib/nostr-bridge/client', () => ({
  getBridgeImpl: () => (bridge.present
    ? { getPublicKey: () => bridge.pubkey, currentRelayUrl: { get: () => bridge.relay } }
    : null),
}));

import {
  seedGameFromCache, scheduleGameCacheFlush, flushGameCache, resetGameCacheWriter,
  GAME_CACHE_EVENT_LIMIT, GAME_CACHE_FLUSH_MS,
} from './cache';
import { flushGameIngest, resetGameIngest, ingestGameEvents } from './ingest';
import { useGamesStore } from '@/store/games';
import { cacheGet, cacheSet, cacheClearAll } from '@/lib/nostr-bridge/cache';
import { KIND_GAME } from '@/lib/nip-kinds';
import { buildCreate, buildGameOp, parseGameEvent, type GameEvent, type ParsedGameEvent } from './protocol';
import { chainReaction } from './chain-reaction';

const CH = 'channel-1';
const HOST = 'pk-host';

function parsed(id: string, pubkey: string, at: number, template: { kind: number; content: string; tags: string[][] }): ParsedGameEvent {
  const ev: GameEvent = { id, pubkey, created_at: at, kind: template.kind, tags: template.tags, content: template.content };
  const p = parseGameEvent(ev);
  if (!p) throw new Error('unparseable');
  return p;
}

const create = (gameId: string) => parsed(gameId, HOST, 1000, buildCreate(CH, { game: chainReaction.type, turnTimeoutS: 45 }));
const join = (id: string, gameId: string, pubkey: string) => parsed(id, pubkey, 1001, buildGameOp(CH, gameId, 'join'));
const checkpoint = (id: string, gameId: string) => parsed(id, HOST, 1002, buildGameOp(CH, gameId, 'checkpoint', {
  seat: HOST, frame: 600, inputs: 'x'.repeat(2000), board: 'y'.repeat(2000),
}));

const read = (gameId: string) => cacheGet<unknown[]>(bridge.relay, KIND_GAME, gameId)?.value;

describe('game log cache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    bridge.pubkey = 'pk-me';
    bridge.relay = 'wss://relay.test';
    bridge.present = true;
    cacheClearAll();
    resetGameCacheWriter();
    resetGameIngest();
    useGamesStore.getState().reset();
  });

  afterEach(() => {
    resetGameCacheWriter();
    vi.useRealTimers();
  });

  it('round-trips a log through disk', () => {
    useGamesStore.getState().ingestMany([create('g1'), join('j1', 'g1', 'pk-b')]);
    scheduleGameCacheFlush(['g1']);
    flushGameCache();

    useGamesStore.getState().reset();
    // Synchronously, by contract: the caller is a layout effect racing a paint,
    // so a seed that landed on the ingest batcher's timer would be too late.
    seedGameFromCache('g1');

    const log = useGamesStore.getState().logs.g1;
    expect(log).toHaveLength(2);
    expect(log.map((e) => e.op).sort()).toEqual(['create', 'join']);
  });

  it('omits checkpoints entirely rather than stripping their blobs', () => {
    useGamesStore.getState().ingestMany([create('g1'), checkpoint('c1', 'g1')]);
    scheduleGameCacheFlush(['g1']);
    flushGameCache();

    const stored = read('g1') as { op: string }[];
    expect(stored).toHaveLength(1);
    expect(stored[0].op).toBe('create');
    // A stripped checkpoint would be cached under its real event id and then
    // permanently shadow the relay's copy, which carries the inputs that make
    // the claim checkable. Absent is the only safe option.
    expect(JSON.stringify(stored)).not.toContain('xxxx');
    expect(JSON.stringify(stored)).not.toContain('yyyy');
  });

  it('skips a table over budget instead of truncating it', () => {
    const many = [
      create('g1'),
      ...Array.from({ length: GAME_CACHE_EVENT_LIMIT }, (_, i) => join(`j${i}`, 'g1', `pk-${i}`)),
    ];
    useGamesStore.getState().ingestMany(many);
    scheduleGameCacheFlush(['g1']);
    flushGameCache();
    // A truncated log replays to a plausible wrong status; nothing replays to a
    // skeleton, which is honest.
    expect(read('g1')).toBeUndefined();
  });

  it('caches a table whose non-checkpoint events fit, however many checkpoints it has', () => {
    useGamesStore.getState().ingestMany([
      create('g1'),
      ...Array.from({ length: 400 }, (_, i) => checkpoint(`c${i}`, 'g1')),
    ]);
    scheduleGameCacheFlush(['g1']);
    flushGameCache();
    expect(read('g1')).toHaveLength(1);
  });

  it('debounces a burst into one deferred write', () => {
    useGamesStore.getState().ingestMany([create('g1')]);
    // jsdom's Storage is a Proxy, and spying on `setItem` writes a storage
    // *item* called "setItem" instead of shadowing the method — so count the
    // timers armed and check the disk state instead.
    const setTimeout = vi.spyOn(globalThis, 'setTimeout');
    scheduleGameCacheFlush(['g1']);
    scheduleGameCacheFlush(['g1']);
    scheduleGameCacheFlush(['g1', 'g1']);
    expect(setTimeout).toHaveBeenCalledTimes(1);
    expect(read('g1')).toBeUndefined();

    vi.advanceTimersByTime(GAME_CACHE_FLUSH_MS);
    expect(read('g1')).toHaveLength(1);

    // And the burst is over: nothing is left armed.
    setTimeout.mockClear();
    vi.advanceTimersByTime(GAME_CACHE_FLUSH_MS * 4);
    expect(setTimeout).not.toHaveBeenCalled();
    setTimeout.mockRestore();
  });

  it('writes nothing before login', () => {
    useGamesStore.getState().ingestMany([create('g1')]);
    bridge.pubkey = null;
    scheduleGameCacheFlush(['g1']);
    flushGameCache();
    expect(read('g1')).toBeUndefined();
  });

  it('reads nothing before login', () => {
    cacheSet(bridge.relay, KIND_GAME, 'g1', [create('g1')]);
    bridge.present = false;
    seedGameFromCache('g1');
    expect(useGamesStore.getState().logs.g1).toBeUndefined();
  });

  it('is scoped per relay', () => {
    useGamesStore.getState().ingestMany([create('g1')]);
    scheduleGameCacheFlush(['g1']);
    flushGameCache();

    useGamesStore.getState().reset();
    bridge.relay = 'wss://other.test';
    seedGameFromCache('g1');
    expect(useGamesStore.getState().logs.g1).toBeUndefined();
  });

  it('drops a corrupt entry instead of feeding it to the replay', () => {
    cacheSet(bridge.relay, KIND_GAME, 'g1', [{ id: 'x', op: 'nonsense' }]);
    seedGameFromCache('g1');
    expect(useGamesStore.getState().logs.g1).toBeUndefined();
    // And it is evicted, so the bad entry is not re-read on every mount.
    expect(read('g1')).toBeUndefined();
  });

  it('does not overwrite a log the relay already delivered', () => {
    cacheSet(bridge.relay, KIND_GAME, 'g1', [create('g1'), join('j1', 'g1', 'pk-b')]);
    useGamesStore.getState().ingest(create('g1'));
    seedGameFromCache('g1');
    expect(useGamesStore.getState().logs.g1).toHaveLength(1);
  });

  it('is wired to the ingest seam, so an ingested log gets written', () => {
    // The listener is registered on module load; ingesting through the seam is
    // all it should take for the log to reach disk.
    flushGameIngest();
    useGamesStore.getState().reset();
    ingestGameEvents([create('g1')]);
    flushGameIngest();
    vi.advanceTimersByTime(GAME_CACHE_FLUSH_MS);
    expect(read('g1')).toHaveLength(1);
  });
});
