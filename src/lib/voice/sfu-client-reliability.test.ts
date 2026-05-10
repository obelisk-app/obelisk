/**
 * Tests for the SFU consume-path reliability layer.
 *
 * Covers:
 *  - Transient RPC failure on `consume` is retried within the backoff
 *    ladder, succeeds, and surfaces exactly one remote track.
 *  - Permanent error code (`CANNOT_CONSUME`) is not retried.
 *  - `consume` succeeded + `resumeConsumer` failed retries only the
 *    resume RPC — no wasted second `consume` round-trip.
 *  - Bounded backoff: 5+ transient failures collapse to exactly
 *    `CONSUME_RETRY_DELAYS_MS.length` attempts, then `consume-failed`.
 *  - Warm-up grace: a brand-new consumer with zero bytes is not
 *    declared stale during STALE_WARMUP_MS.
 *  - Stale watchdog: a consumer whose `bytesReceived` doesn't grow
 *    past `STALE_TIMEOUT_MS` is rebuilt and the new track surfaces.
 *
 * The SFU is mocked at `./sfu-rpc` (so we drive `request()` outcomes
 * directly) and `mediasoup-client` (Device / Transport / Consumer are
 * stub objects that surface only what `SfuClient` actually consumes).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock setup ────────────────────────────────────────────────────────────
// Captured handler the SfuClient registers so tests can fire `newProducer`
// notifications directly without going through Nostr.
let capturedOnNotification: ((n: unknown) => void) | null = null;
const rpcRequest = vi.fn();

vi.mock('./sfu-rpc', () => {
  class FakeSfuRpc {
    constructor(opts: { onNotification: (n: unknown) => void }) {
      capturedOnNotification = opts.onNotification;
    }
    async start() { /* no-op */ }
    close() { /* no-op */ }
    request = rpcRequest;
  }
  return { SfuRpc: FakeSfuRpc };
});

interface FakeConsumerHandlers {
  transportclose?: () => void;
  trackended?: () => void;
}
interface FakeConsumer {
  id: string;
  producerId: string;
  kind: 'audio' | 'video';
  paused: boolean;
  track: { id: string; kind: string };
  on: (event: 'transportclose' | 'trackended', cb: () => void) => void;
  close: () => void;
  getStats: () => Promise<Map<string, unknown>>;
  __handlers: FakeConsumerHandlers;
  __closed: boolean;
  __bytesReceived: number;
}

let consumerCounter = 0;
function makeFakeConsumer(producerId: string, kind: 'audio' | 'video' = 'video'): FakeConsumer {
  consumerCounter += 1;
  const handlers: FakeConsumerHandlers = {};
  const consumer: FakeConsumer = {
    id: `consumer-${consumerCounter}`,
    producerId,
    kind,
    paused: false,
    track: { id: `track-${consumerCounter}`, kind },
    on(event, cb) { handlers[event] = cb; },
    close() { this.__closed = true; },
    async getStats() {
      const map = new Map<string, unknown>();
      map.set('inbound-rtp-0', { type: 'inbound-rtp', bytesReceived: this.__bytesReceived });
      return map;
    },
    __handlers: handlers,
    __closed: false,
    __bytesReceived: 0,
  };
  return consumer;
}

// Most-recent recv transport from the fake Device — so tests can drive
// `transport.consume` outcomes per producer.
const recvConsume = vi.fn();

const fakeRecvTransport = {
  on: vi.fn(),
  consume: recvConsume,
  close: vi.fn(),
};
const fakeSendTransport = {
  on: vi.fn(),
  produce: vi.fn(),
  close: vi.fn(),
};

vi.mock('mediasoup-client', () => {
  class FakeDevice {
    rtpCapabilities = { codecs: [] };
    async load() { /* no-op */ }
    createSendTransport() { return fakeSendTransport; }
    createRecvTransport() { return fakeRecvTransport; }
  }
  return { Device: FakeDevice };
});

// MediaStream is referenced in the surfaceConsumer path. Node lacks it.
class FakeMediaStream {
  private tracks: unknown[];
  constructor(tracks: unknown[]) { this.tracks = tracks; }
  getTracks() { return this.tracks; }
}
(globalThis as unknown as { MediaStream?: typeof FakeMediaStream }).MediaStream = FakeMediaStream;

// ── Imports under test ────────────────────────────────────────────────────
import {
  SfuClient,
  CONSUME_RETRY_DELAYS_MS,
  STALE_CHECK_INTERVAL_MS,
  STALE_TIMEOUT_MS,
  STALE_WARMUP_MS,
  type SfuRemoteTrack,
  type SfuReliabilityEvent,
} from './sfu-client';

// ── Harness ───────────────────────────────────────────────────────────────
interface Harness {
  client: SfuClient;
  remoteTracks: SfuRemoteTrack[];
  endedTrackIds: string[];
  reliability: SfuReliabilityEvent[];
  fireNewProducer: (producerId: string, originPubkey?: string) => void;
}

async function startClient(): Promise<Harness> {
  const remoteTracks: SfuRemoteTrack[] = [];
  const endedTrackIds: string[] = [];
  const reliability: SfuReliabilityEvent[] = [];

  // Configure the four create*Transport / load RPC calls the start path
  // makes (in order: getRouterRtpCapabilities, createWebRtcTransport
  // send, createWebRtcTransport recv). See `SfuClient.start` +
  // `createTransports`.
  rpcRequest.mockImplementation(async (method: string) => {
    if (method === 'getRouterRtpCapabilities') return { codecs: [] };
    if (method === 'createWebRtcTransport') {
      return {
        id: `transport-${Math.random()}`,
        iceParameters: {},
        iceCandidates: [],
        dtlsParameters: {},
      };
    }
    throw new Error(`unexpected RPC during start: ${method}`);
  });

  const client = new SfuClient({
    channelId: 'channel-1',
    sfuPubkey: 'sfu-pub',
    selfPubkey: 'self-pub',
    events: {
      onRemoteTrack: (t) => { remoteTracks.push(t); },
      onRemoteTrackEnded: (id) => { endedTrackIds.push(id); },
      onReliabilityEvent: (ev) => { reliability.push(ev); },
    },
  });
  await client.start();

  // After start(), reset the request mock so per-test scripting takes
  // over for the consume + resumeConsumer calls.
  rpcRequest.mockReset();

  return {
    client,
    remoteTracks,
    endedTrackIds,
    reliability,
    fireNewProducer: (producerId, originPubkey) => {
      capturedOnNotification?.({
        type: 'notification',
        method: 'newProducer',
        data: {
          producerId,
          kind: 'video',
          appData: { kind: 'camera', originPubkey: originPubkey ?? 'peer-1' },
        },
      });
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  consumerCounter = 0;
  capturedOnNotification = null;
  rpcRequest.mockReset();
  recvConsume.mockReset();
  fakeRecvTransport.on.mockReset();
  fakeSendTransport.on.mockReset();
  fakeSendTransport.produce.mockReset();
});

afterEach(async () => {
  vi.useRealTimers();
});

async function flush(): Promise<void> {
  // Drain the microtask queue across multiple `await` hops without
  // letting fake timers fire.
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

// ── Tests ────────────────────────────────────────────────────────────────
describe('SfuClient consume retry', () => {
  it('retries a transient consume failure and surfaces the track', async () => {
    const h = await startClient();
    const consumer = makeFakeConsumer('producer-A');
    let consumeCalls = 0;
    rpcRequest.mockImplementation(async (method: string) => {
      if (method === 'consume') {
        consumeCalls += 1;
        if (consumeCalls === 1) throw new Error('rpc timeout: consume');
        return {
          id: consumer.id,
          producerId: 'producer-A',
          kind: 'video',
          rtpParameters: {},
          appData: { kind: 'camera', originPubkey: 'peer-1' },
        };
      }
      if (method === 'resumeConsumer') return undefined;
      throw new Error(`unexpected: ${method}`);
    });
    recvConsume.mockResolvedValue(consumer);

    h.fireNewProducer('producer-A');
    await flush();

    // First attempt failed, retry timer scheduled.
    expect(h.remoteTracks).toHaveLength(0);
    expect(h.reliability.filter((e) => e.kind === 'consume-retry')).toHaveLength(1);

    // Advance past the first backoff step.
    await vi.advanceTimersByTimeAsync(CONSUME_RETRY_DELAYS_MS[0] + 1);
    await flush();

    expect(h.remoteTracks).toHaveLength(1);
    expect(h.remoteTracks[0]?.trackId).toBe(consumer.track.id);
    expect(h.reliability.some((e) => e.kind === 'consume-failed')).toBe(false);
  });

  it('does not retry a permanent CANNOT_CONSUME error', async () => {
    const h = await startClient();
    let consumeCalls = 0;
    rpcRequest.mockImplementation(async (method: string) => {
      if (method === 'consume') {
        consumeCalls += 1;
        const err = new Error('cannot consume — codec mismatch');
        (err as Error & { code: string }).code = 'CANNOT_CONSUME';
        throw err;
      }
      throw new Error(`unexpected: ${method}`);
    });

    h.fireNewProducer('producer-B');
    await flush();
    // Run any pending timer just to confirm nothing else fires.
    await vi.advanceTimersByTimeAsync(20_000);
    await flush();

    expect(consumeCalls).toBe(1);
    expect(h.remoteTracks).toHaveLength(0);
    const failed = h.reliability.filter((e) => e.kind === 'consume-failed');
    expect(failed).toHaveLength(1);
    expect(failed[0]?.errorCode).toBe('CANNOT_CONSUME');
    expect(h.reliability.some((e) => e.kind === 'consume-retry')).toBe(false);
  });

  it('retries only resumeConsumer when consume already succeeded', async () => {
    const h = await startClient();
    const consumer = makeFakeConsumer('producer-C');
    let consumeCalls = 0;
    let resumeCalls = 0;
    rpcRequest.mockImplementation(async (method: string) => {
      if (method === 'consume') {
        consumeCalls += 1;
        return {
          id: consumer.id,
          producerId: 'producer-C',
          kind: 'video',
          rtpParameters: {},
          appData: { kind: 'camera', originPubkey: 'peer-1' },
        };
      }
      if (method === 'resumeConsumer') {
        resumeCalls += 1;
        if (resumeCalls === 1) throw new Error('rpc timeout: resumeConsumer');
        return undefined;
      }
      throw new Error(`unexpected: ${method}`);
    });
    recvConsume.mockResolvedValue(consumer);

    h.fireNewProducer('producer-C');
    await flush();
    await vi.advanceTimersByTimeAsync(CONSUME_RETRY_DELAYS_MS[0] + 1);
    await flush();

    expect(consumeCalls).toBe(1);   // not re-issued
    expect(resumeCalls).toBe(2);    // retried
    expect(h.remoteTracks).toHaveLength(1);
  });

  it('gives up after the backoff ladder is exhausted', async () => {
    const h = await startClient();
    let consumeCalls = 0;
    rpcRequest.mockImplementation(async (method: string) => {
      if (method === 'consume') {
        consumeCalls += 1;
        throw new Error('rpc timeout: consume');
      }
      throw new Error(`unexpected: ${method}`);
    });

    h.fireNewProducer('producer-D');
    await flush();
    // Walk through the entire ladder.
    for (const delay of CONSUME_RETRY_DELAYS_MS) {
      await vi.advanceTimersByTimeAsync(delay + 1);
      await flush();
    }

    expect(consumeCalls).toBe(CONSUME_RETRY_DELAYS_MS.length);
    expect(h.remoteTracks).toHaveLength(0);
    expect(h.reliability.filter((e) => e.kind === 'consume-retry')).toHaveLength(CONSUME_RETRY_DELAYS_MS.length - 1);
    expect(h.reliability.filter((e) => e.kind === 'consume-failed')).toHaveLength(1);

    // Subsequent timer ticks must not schedule another attempt.
    await vi.advanceTimersByTimeAsync(60_000);
    await flush();
    expect(consumeCalls).toBe(CONSUME_RETRY_DELAYS_MS.length);
  });
});

describe('SfuClient stale-consumer watchdog', () => {
  it('does not declare a consumer stale before the stale-timeout has elapsed', async () => {
    const h = await startClient();
    const consumer = makeFakeConsumer('producer-E');
    rpcRequest.mockImplementation(async (method: string) => {
      if (method === 'consume') {
        return {
          id: consumer.id, producerId: 'producer-E', kind: 'video',
          rtpParameters: {}, appData: { kind: 'camera', originPubkey: 'peer-1' },
        };
      }
      if (method === 'resumeConsumer') return undefined;
      throw new Error(`unexpected: ${method}`);
    });
    recvConsume.mockResolvedValue(consumer);
    h.fireNewProducer('producer-E');
    await flush();
    expect(h.remoteTracks).toHaveLength(1);

    // Tick the watchdog repeatedly while staying just shy of the stale
    // timeout (and through the warm-up grace at the start). Even though
    // bytesReceived is frozen at 0, neither guard should trip.
    const ticks = Math.max(1, Math.floor((STALE_TIMEOUT_MS + STALE_WARMUP_MS) / STALE_CHECK_INTERVAL_MS) - 1);
    for (let i = 0; i < ticks; i++) {
      await vi.advanceTimersByTimeAsync(STALE_CHECK_INTERVAL_MS);
      await flush();
    }

    expect(h.endedTrackIds).toHaveLength(0);
    expect(h.reliability.some((e) => e.kind === 'stale-consumer')).toBe(false);
    expect(consumer.__closed).toBe(false);
  });

  it('rebuilds a wedged consumer once bytesReceived stalls past the timeout', async () => {
    const h = await startClient();
    const wedged = makeFakeConsumer('producer-F');
    const replacement = makeFakeConsumer('producer-F');
    let consumeCalls = 0;
    rpcRequest.mockImplementation(async (method: string) => {
      if (method === 'consume') {
        consumeCalls += 1;
        const c = consumeCalls === 1 ? wedged : replacement;
        return {
          id: c.id, producerId: 'producer-F', kind: 'video',
          rtpParameters: {}, appData: { kind: 'camera', originPubkey: 'peer-1' },
        };
      }
      if (method === 'resumeConsumer') return undefined;
      throw new Error(`unexpected: ${method}`);
    });
    recvConsume
      .mockResolvedValueOnce(wedged)
      .mockResolvedValueOnce(replacement);

    h.fireNewProducer('producer-F');
    await flush();
    expect(h.remoteTracks).toHaveLength(1);
    expect(h.remoteTracks[0]?.trackId).toBe(wedged.track.id);

    // Walk past warm-up + stale-timeout while bytesReceived stays at 0.
    await vi.advanceTimersByTimeAsync(STALE_WARMUP_MS + STALE_TIMEOUT_MS + STALE_CHECK_INTERVAL_MS);
    await flush();
    // First retry tick of the rebuild.
    await vi.advanceTimersByTimeAsync(CONSUME_RETRY_DELAYS_MS[0] + 1);
    await flush();

    expect(wedged.__closed).toBe(true);
    expect(h.endedTrackIds).toContain(wedged.track.id);
    expect(h.reliability.some((e) => e.kind === 'stale-consumer')).toBe(true);
    // A fresh track should now be surfaced.
    expect(h.remoteTracks.length).toBeGreaterThanOrEqual(2);
    expect(h.remoteTracks[h.remoteTracks.length - 1]?.trackId).toBe(replacement.track.id);
  });
});
