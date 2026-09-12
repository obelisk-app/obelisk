import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const subscribeFilterWatched = vi.hoisted(
  () => vi.fn<(...args: unknown[]) => () => void>(() => () => {}),
);

vi.mock('@/lib/nostr-bridge/client', () => ({
  getBridge: vi.fn(async () => ({})),
  getBridgeImpl: () => ({ subscribeFilterWatched }),
}));

import {
  requestGameLoad, __resetGameResolver,
  RESOLVE_BATCH_MS, RESOLVE_WAIT_MS, RESOLVE_MAX_IDS, RESOLVE_RETRY_MS,
} from './resolve';
import { flushGameIngest, resetGameIngest } from './ingest';
import { useGamesStore } from '@/store/games';
import { buildCreate, buildGameOp, parseGameEvent, type GameEvent, type ParsedGameEvent } from './protocol';
import { chainReaction } from './chain-reaction';

const CH = 'channel-1';
const HOST = 'pk-host';

function parsed(id: string, pubkey: string, template: { kind: number; content: string; tags: string[][] }): ParsedGameEvent {
  const ev: GameEvent = { id, pubkey, created_at: 1000, kind: template.kind, tags: template.tags, content: template.content };
  const p = parseGameEvent(ev);
  if (!p) throw new Error('unparseable');
  return p;
}

const createRaw = (id: string) => ({
  id,
  pubkey: HOST,
  created_at: 1000,
  ...buildCreate(CH, { game: chainReaction.type, turnTimeoutS: 45 }),
});

type Req = { filter: Record<string, unknown>; onEvent: (ev: unknown) => void; close: ReturnType<typeof vi.fn> };
let reqs: Req[];

const idFilters = () => reqs.filter((r) => r.filter.ids !== undefined);
const opFilters = () => reqs.filter((r) => r.filter['#e'] !== undefined);

/** Let the batch timer fire and the async bridge hop settle. */
async function runBatch() {
  await vi.advanceTimersByTimeAsync(RESOLVE_BATCH_MS);
}

describe('resolving a table by id', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reqs = [];
    subscribeFilterWatched.mockReset();
    subscribeFilterWatched.mockImplementation((...args: unknown[]) => {
      const close = vi.fn();
      reqs.push({
        filter: args[0] as Record<string, unknown>,
        onEvent: args[1] as (ev: unknown) => void,
        close,
      });
      return close;
    });
    __resetGameResolver();
    resetGameIngest();
    useGamesStore.getState().reset();
  });

  afterEach(() => {
    __resetGameResolver();
    vi.useRealTimers();
  });

  it('batches every id requested in one window into one pair of REQs', async () => {
    for (const id of ['g1', 'g2', 'g3', 'g4', 'g5']) requestGameLoad(id);
    await runBatch();

    expect(idFilters()).toHaveLength(1);
    expect(opFilters()).toHaveLength(1);
    expect(idFilters()[0].filter.ids).toEqual(['g1', 'g2', 'g3', 'g4', 'g5']);
    expect(opFilters()[0].filter['#e']).toEqual(['g1', 'g2', 'g3', 'g4', 'g5']);
  });

  it('never sends a `since` — that window is exactly what it exists to escape', async () => {
    requestGameLoad('g1');
    await runBatch();
    for (const r of reqs) expect(r.filter.since).toBeUndefined();
  });

  it('asks for the create by exact id and the ops by e-tag', async () => {
    requestGameLoad('g1');
    await runBatch();
    // The id filter carries no kind: an exact-id query needs no narrowing, and
    // this is the filter that must work on every relay.
    expect(idFilters()[0].filter).toEqual({ ids: ['g1'] });
    expect(opFilters()[0].filter.kinds).toEqual([2390]);
    expect(opFilters()[0].filter.limit).toBeTypeOf('number');
  });

  it('ingests what comes back and closes both subs when the window ends', async () => {
    requestGameLoad('g1');
    await runBatch();
    idFilters()[0].onEvent(createRaw('g1'));
    flushGameIngest();
    expect(useGamesStore.getState().logs.g1).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(RESOLVE_WAIT_MS);
    for (const r of reqs) expect(r.close).toHaveBeenCalled();
  });

  it('does not ask for a table it already has', async () => {
    useGamesStore.getState().ingest(parsed('g1', HOST, buildCreate(CH, { game: chainReaction.type, turnTimeoutS: 45 })));
    requestGameLoad('g1');
    await runBatch();
    expect(reqs).toHaveLength(0);
  });

  it('ignores a repeat request for an id already in flight', async () => {
    requestGameLoad('g1');
    requestGameLoad('g1');
    requestGameLoad('g1');
    await runBatch();
    expect(idFilters()[0].filter.ids).toEqual(['g1']);
  });

  it('retries an id nothing came back for, then gives up', async () => {
    requestGameLoad('g1');
    await runBatch();
    expect(idFilters()).toHaveLength(1);

    // Window closes with nothing delivered → first retry.
    await vi.advanceTimersByTimeAsync(RESOLVE_WAIT_MS);
    await vi.advanceTimersByTimeAsync(RESOLVE_RETRY_MS[0] + RESOLVE_BATCH_MS);
    expect(idFilters()).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(RESOLVE_WAIT_MS);
    await vi.advanceTimersByTimeAsync(RESOLVE_RETRY_MS[1] + RESOLVE_BATCH_MS);
    expect(idFilters()).toHaveLength(3);

    // Three attempts is the ladder. It does not keep hammering the relay for a
    // table that does not exist.
    await vi.advanceTimersByTimeAsync(RESOLVE_WAIT_MS);
    await vi.advanceTimersByTimeAsync(RESOLVE_RETRY_MS[1] * 4);
    expect(idFilters()).toHaveLength(3);
  });

  it('stops retrying the moment the table lands', async () => {
    requestGameLoad('g1');
    await runBatch();
    idFilters()[0].onEvent(createRaw('g1'));
    flushGameIngest();

    await vi.advanceTimersByTimeAsync(RESOLVE_WAIT_MS + RESOLVE_RETRY_MS[0] + RESOLVE_RETRY_MS[1] + RESOLVE_BATCH_MS);
    expect(idFilters()).toHaveLength(1);
  });

  it('splits an oversized batch instead of putting a huge list in one filter', async () => {
    const ids = Array.from({ length: RESOLVE_MAX_IDS + 10 }, (_, i) => `g${i}`);
    for (const id of ids) requestGameLoad(id);
    await runBatch();

    expect(idFilters()).toHaveLength(1);
    expect((idFilters()[0].filter.ids as string[])).toHaveLength(RESOLVE_MAX_IDS);

    await runBatch();
    expect(idFilters()).toHaveLength(2);
    expect((idFilters()[1].filter.ids as string[])).toHaveLength(10);
  });

  it('an op arriving without its create still leaves the table unresolved', async () => {
    requestGameLoad('g1');
    await runBatch();
    opFilters()[0].onEvent({ id: 'j1', pubkey: 'pk-b', created_at: 1001, ...buildGameOp(CH, 'g1', 'join') });
    flushGameIngest();
    // The log is not empty, but there is no board to show — and the retry
    // ladder has to keep going, or the card is stuck on a partial log.
    expect(useGamesStore.getState().logs.g1).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(RESOLVE_WAIT_MS);
    await vi.advanceTimersByTimeAsync(RESOLVE_RETRY_MS[0] + RESOLVE_BATCH_MS);
    expect(idFilters()).toHaveLength(2);
  });
});
