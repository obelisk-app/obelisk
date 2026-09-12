import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const publishEvent = vi.hoisted(() => vi.fn());
const dropRelayConnection = vi.hoisted(() => vi.fn());
const subscribeFilterWatched = vi.hoisted(
  () => vi.fn<(...args: unknown[]) => () => void>(() => () => {}),
);
const getPublicKey = vi.hoisted(() => vi.fn(() => 'pk-me'));

const relayUrl = vi.hoisted(() => ({ value: 'wss://relay.test' }));

vi.mock('@/lib/nostr-bridge/client', () => ({
  getBridge: vi.fn(async () => ({})),
  getBridgeImpl: () => ({
    publishEvent,
    dropRelayConnection,
    subscribeFilterWatched,
    getPublicKey,
    currentRelayUrl: { get: () => relayUrl.value },
  }),
}));

import {
  publishJoin, publishCreate, looksLikeLostConfirmation,
  subscribeChannelGames, __resetTagIndexProbe,
  CHANNEL_GAME_LIMIT, TAG_PROBE_MS,
} from './transport';
import { flushGameIngest, resetGameIngest } from './ingest';
import { useGamesStore } from '@/store/games';
import { buildCreate, buildGameOp, GAME_TAG } from './protocol';
import { chainReaction } from './chain-reaction';

const CH = 'channel-1';
const GAME = 'g'.repeat(64);

/** What the bridge actually hands back: a fully signed event, not just an id. */
function signed(id: string, pubkey: string, template: { kind: number; content: string; tags: string[][] }) {
  return { id, pubkey, created_at: 1000, kind: template.kind, tags: template.tags, content: template.content, sig: 'x' };
}

describe('publishing a game event when the relay never answers', () => {
  beforeEach(() => {
    publishEvent.mockReset();
    dropRelayConnection.mockReset();
    subscribeFilterWatched.mockReset();
    subscribeFilterWatched.mockImplementation(() => () => {});
  });

  it('recognises a lost confirmation, and only that', () => {
    expect(looksLikeLostConfirmation('wss://relay: publish timed out')).toBe(true);
    expect(looksLikeLostConfirmation('no relay accepted')).toBe(true);
    // A refusal with a reason is not a lost confirmation.
    expect(looksLikeLostConfirmation('blocked: not a member')).toBe(false);
    expect(looksLikeLostConfirmation('invalid: bad signature')).toBe(false);
  });

  it('drops the dead connection before retrying, then succeeds', async () => {
    publishEvent
      .mockRejectedValueOnce(new Error('wss://public.obelisk.ar: publish timed out'))
      .mockResolvedValueOnce({ id: 'ok' });

    await publishJoin(CH, GAME);

    // Retrying on the same pooled socket would have died the same way, so the
    // connection has to be dropped between the two attempts.
    expect(dropRelayConnection).toHaveBeenCalledTimes(1);
    expect(publishEvent).toHaveBeenCalledTimes(2);
    expect(dropRelayConnection.mock.invocationCallOrder[0])
      .toBeLessThan(publishEvent.mock.invocationCallOrder[1]);
  });

  it('does not retry a refusal that came with a reason', async () => {
    publishEvent.mockRejectedValue(new Error('blocked: you are not a member of this group'));
    await expect(publishJoin(CH, GAME)).rejects.toThrow(/not a member/);
    expect(publishEvent).toHaveBeenCalledTimes(1);
    expect(dropRelayConnection).not.toHaveBeenCalled();
  });

  it('publishes once when the relay answers first time', async () => {
    publishEvent.mockResolvedValue({ id: 'ok' });
    await publishJoin(CH, GAME);
    expect(publishEvent).toHaveBeenCalledTimes(1);
    expect(dropRelayConnection).not.toHaveBeenCalled();
  });

  describe('creating a table', () => {
    it('returns the id when the retry lands', async () => {
      publishEvent
        .mockRejectedValueOnce(new Error('publish timed out'))
        .mockResolvedValueOnce({ id: 'table-id' });

      await expect(publishCreate(CH, { game: 'stacker', turnTimeoutS: 0 })).resolves.toBe('table-id');
    });

    it('recovers the table when both attempts time out but the event landed', async () => {
      publishEvent.mockRejectedValue(new Error('publish timed out'));
      // The event was stored; only the OK was lost. The nonce lets us find it.
      subscribeFilterWatched.mockImplementation((...args: unknown[]) => {
        const onEvent = args[1] as (ev: unknown) => void;
        const template = publishEvent.mock.calls[0][0] as { content: string; tags: string[][] };
        const nonce = (JSON.parse(template.content) as { nonce: string }).nonce;
        setTimeout(() => onEvent({
          id: 'recovered-id',
          pubkey: 'pk-me',
          created_at: Math.floor(Date.now() / 1000),
          kind: 2390,
          tags: template.tags,
          content: JSON.stringify({ game: 'stacker', opts: {}, turnTimeoutS: 0, nonce }),
        }), 0);
        return () => {};
      });

      await expect(publishCreate(CH, { game: 'stacker', turnTimeoutS: 0 })).resolves.toBe('recovered-id');
    });

    it('says so plainly when the table really did not land', async () => {
      publishEvent.mockRejectedValue(new Error('publish timed out'));
      await expect(publishCreate(CH, { game: 'stacker', turnTimeoutS: 0 }, ))
        .rejects.toThrow(/never confirmed/i);
    }, 10000);
  });
});

describe('local echo', () => {
  beforeEach(() => {
    publishEvent.mockReset();
    dropRelayConnection.mockReset();
    subscribeFilterWatched.mockReset();
    subscribeFilterWatched.mockImplementation(() => () => {});
    resetGameIngest();
    useGamesStore.getState().reset();
  });

  it('puts our own event in the log without waiting for the relay to echo it', async () => {
    const template = buildCreate(CH, { game: chainReaction.type, turnTimeoutS: 45 });
    publishEvent.mockResolvedValue(signed('table-1', 'pk-me', template));

    await publishCreate(CH, { game: chainReaction.type, turnTimeoutS: 45 });
    flushGameIngest();

    expect(useGamesStore.getState().logs['table-1']).toHaveLength(1);
    expect(useGamesStore.getState().channelOf['table-1']).toBe(CH);
  });

  it('echoes an op against an existing table', async () => {
    publishEvent.mockResolvedValue(signed('join-1', 'pk-me', buildGameOp(CH, GAME, 'join')));
    await publishJoin(CH, GAME);
    flushGameIngest();
    expect(useGamesStore.getState().logs[GAME]).toHaveLength(1);
  });

  it('echoes exactly once when the first attempt timed out', async () => {
    const template = buildGameOp(CH, GAME, 'join');
    publishEvent
      .mockRejectedValueOnce(new Error('publish timed out'))
      .mockResolvedValueOnce(signed('join-1', 'pk-me', template));

    await publishJoin(CH, GAME);
    flushGameIngest();

    expect(useGamesStore.getState().logs[GAME]).toHaveLength(1);
  });

  it('ingests nothing, and does not throw, when the response is not a game event', async () => {
    publishEvent.mockResolvedValue({ id: 'ok' });
    await expect(publishJoin(CH, GAME)).resolves.toBeUndefined();
    flushGameIngest();
    expect(useGamesStore.getState().logs[GAME]).toBeUndefined();
  });

  it('echoes a create recovered by its nonce', async () => {
    publishEvent.mockRejectedValue(new Error('publish timed out'));
    subscribeFilterWatched.mockImplementation((...args: unknown[]) => {
      const onEvent = args[1] as (ev: unknown) => void;
      const template = publishEvent.mock.calls[0][0] as { content: string; tags: string[][] };
      const nonce = (JSON.parse(template.content) as { nonce: string }).nonce;
      setTimeout(() => onEvent({
        id: 'recovered-id',
        pubkey: 'pk-me',
        created_at: 1000,
        kind: 2390,
        tags: template.tags,
        content: JSON.stringify({ game: chainReaction.type, opts: {}, turnTimeoutS: 0, nonce }),
      }), 0);
      return () => {};
    });

    await publishCreate(CH, { game: chainReaction.type, turnTimeoutS: 0 });
    flushGameIngest();

    expect(useGamesStore.getState().logs['recovered-id']).toHaveLength(1);
  });
});

describe('subscribing to a channel\'s games', () => {
  type Handler = (ev: unknown) => void;
  /** Every REQ the subscription opened, in order, with its handler and closer. */
  let reqs: { filter: Record<string, unknown>; onEvent: Handler; close: ReturnType<typeof vi.fn> }[];

  const gameEvent = (channel: string, id = 'ev-1') => ({
    id,
    pubkey: 'pk-host',
    created_at: 1000,
    kind: 2390,
    tags: [['h', channel], ['t', GAME_TAG], ['op', 'create'], ['game', chainReaction.type]],
    content: JSON.stringify({ game: chainReaction.type, opts: {}, turnTimeoutS: 45 }),
  });

  const filters = () => reqs.map((r) => r.filter);
  const broadOpened = () => filters().some((f) =>
    f.kinds !== undefined && f['#h'] === undefined && f['#t'] === undefined);
  const probeOpened = () => filters().some((f) => f['#t'] !== undefined);

  beforeEach(() => {
    vi.useFakeTimers();
    reqs = [];
    relayUrl.value = 'wss://relay.test';
    __resetTagIndexProbe();
    subscribeFilterWatched.mockReset();
    subscribeFilterWatched.mockImplementation((...args: unknown[]) => {
      const close = vi.fn();
      reqs.push({
        filter: args[0] as Record<string, unknown>,
        onEvent: args[1] as Handler,
        close,
      });
      return close;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks the narrow question first', async () => {
    await subscribeChannelGames(CH, () => {});
    expect(reqs).toHaveLength(1);
    expect(reqs[0].filter).toMatchObject({
      kinds: [2390],
      '#h': [CH],
      limit: CHANNEL_GAME_LIMIT,
    });
    expect(reqs[0].filter.since).toBeTypeOf('number');
  });

  it('never probes or widens once the tagged sub has delivered', async () => {
    const onEvent = vi.fn();
    await subscribeChannelGames(CH, onEvent);
    reqs[0].onEvent(gameEvent(CH));
    expect(onEvent).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(TAG_PROBE_MS * 4);
    expect(probeOpened()).toBe(false);
    expect(broadOpened()).toBe(false);
  });

  it('reads a silent tagged sub as "nobody is playing" when the relay can index the tag', async () => {
    await subscribeChannelGames(CH, () => {});

    vi.advanceTimersByTime(TAG_PROBE_MS);
    expect(probeOpened()).toBe(true);
    // The control finds a game event elsewhere on the relay: the index works,
    // so the quiet channel really is quiet.
    reqs[1].onEvent(gameEvent('some-other-channel', 'ev-elsewhere'));

    vi.advanceTimersByTime(TAG_PROBE_MS * 4);
    expect(broadOpened()).toBe(false);
  });

  it('falls back to the relay-wide filter only when the control is silent too', async () => {
    await subscribeChannelGames(CH, () => {});
    vi.advanceTimersByTime(TAG_PROBE_MS);
    expect(broadOpened()).toBe(false);

    vi.advanceTimersByTime(TAG_PROBE_MS);
    expect(broadOpened()).toBe(true);
    const broad = filters().find((f) => f.kinds !== undefined && f['#h'] === undefined && f['#t'] === undefined)!;
    expect(broad['#t']).toBeUndefined();
    expect(broad.since).toBeTypeOf('number');
  });

  it('remembers what it learned about a relay, per relay', async () => {
    const first = await subscribeChannelGames(CH, () => {});
    vi.advanceTimersByTime(TAG_PROBE_MS * 2);
    expect(broadOpened()).toBe(true);
    first();

    // Second channel, same relay: it already knows, so no probe and no wait.
    reqs = [];
    await subscribeChannelGames('channel-2', () => {});
    expect(broadOpened()).toBe(true);
    expect(probeOpened()).toBe(false);

    // A different relay starts from scratch.
    reqs = [];
    relayUrl.value = 'wss://other.test';
    await subscribeChannelGames('channel-3', () => {});
    expect(broadOpened()).toBe(false);
  });

  it('drops a foreign channel\'s event without parsing its content', async () => {
    const onEvent = vi.fn();
    await subscribeChannelGames(CH, onEvent);
    vi.advanceTimersByTime(TAG_PROBE_MS * 2);
    const broad = reqs.find((r) => r.filter.kinds !== undefined && r.filter['#h'] === undefined && r.filter['#t'] === undefined)!;

    // Unparseable content on purpose: reaching JSON.parse at all is the failure.
    broad.onEvent({
      id: 'ev-foreign',
      pubkey: 'pk-x',
      created_at: 1000,
      kind: 2390,
      tags: [['h', 'not-our-channel'], ['op', 'create']],
      content: '{{{ not json',
    });
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('delivers each event once, however many subs saw it', async () => {
    const onEvent = vi.fn();
    await subscribeChannelGames(CH, onEvent);
    reqs[0].onEvent(gameEvent(CH, 'ev-dup'));
    reqs[0].onEvent(gameEvent(CH, 'ev-dup'));
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('closes every sub and timer it opened', async () => {
    const unsub = await subscribeChannelGames(CH, () => {});
    vi.advanceTimersByTime(TAG_PROBE_MS * 2);
    expect(reqs.length).toBeGreaterThanOrEqual(3);
    unsub();
    for (const r of reqs) expect(r.close).toHaveBeenCalled();

    // And nothing fires afterwards.
    const before = reqs.length;
    vi.advanceTimersByTime(TAG_PROBE_MS * 10);
    expect(reqs).toHaveLength(before);
  });

  it('does not widen when it is torn down mid-probe', async () => {
    const unsub = await subscribeChannelGames(CH, () => {});
    vi.advanceTimersByTime(TAG_PROBE_MS);
    unsub();
    vi.advanceTimersByTime(TAG_PROBE_MS * 4);
    expect(broadOpened()).toBe(false);
  });
});
