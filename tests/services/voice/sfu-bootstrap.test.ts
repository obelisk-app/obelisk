import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const clients = vi.hoisted(() => [] as Array<{ opts: Record<string, unknown>; start: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }>);
const startBehaviour = vi.hoisted(() => ({ next: [] as Array<() => Promise<void>> }));
vi.mock('@/services/voice/sfu-client', () => ({
  SfuClient: class {
    start: ReturnType<typeof vi.fn>;
    close = vi.fn(async () => {});
    constructor(public opts: Record<string, unknown>) {
      const behaviour = startBehaviour.next.shift() ?? (async () => {});
      this.start = vi.fn(behaviour);
      clients.push(this as never);
    }
  },
}));
const control = vi.hoisted(() => ({ publishSfuStart: vi.fn(async () => true), pickSfu: vi.fn() }));
vi.mock('@/services/voice/sfu-control', () => control);

import { startSfuClient, type SfuBootstrapTarget } from '@/services/voice/sfu-bootstrap';
import type { SfuSessionDeps } from '@/services/voice/sfu-session';
import type { SfuAdvertisement } from '@/services/voice/sfu-control';
import { emptyVoiceMetrics } from '@/services/voice/metrics';

const SFU = 's'.repeat(64);

function advert(url: string | null): SfuAdvertisement {
  return {
    pubkey: SFU, url, region: null, cap: null, createdAt: 1,
    trustedRelays: ['wss://trusted.example'], generalRelays: ['wss://general.example'],
  };
}

function setup(joined = true) {
  const events = { onTopologyChange: vi.fn(), onError: vi.fn() };
  const deps = {
    room: { events },
    channelId: 'c'.repeat(64),
    selfPubkey: 'm'.repeat(64),
    metrics: emptyVoiceMetrics(),
    localMedia: { publishAllTo: vi.fn(async () => {}) },
    watcher: {},
    isJoined: () => joined,
    expectSfu: () => true,
  } as unknown as SfuSessionDeps;
  const target: SfuBootstrapTarget = { pubkey: SFU, client: null };
  return { deps, target, events };
}

beforeEach(() => {
  clients.length = 0;
  startBehaviour.next = [];
  control.publishSfuStart.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('startSfuClient', () => {
  it('a direct URL skips the Nostr start; RPC goes to the general relays', async () => {
    const { deps, target } = setup();
    await startSfuClient(target, deps, SFU, advert('https://sfu.example'));
    expect(control.publishSfuStart).not.toHaveBeenCalled();
    expect(clients[0].opts).toMatchObject({ sfuUrl: 'https://sfu.example', trustedRelays: ['wss://general.example'] });
    expect(target.client).toBe(clients[0]);
    expect(deps.localMedia.publishAllTo).toHaveBeenCalledWith(clients[0]);
  });

  it('without a URL, publishes start on the trusted relays first', async () => {
    vi.useFakeTimers();
    const { deps, target } = setup();
    const done = startSfuClient(target, deps, SFU, advert(null));
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect(control.publishSfuStart).toHaveBeenCalledWith(deps.channelId, SFU, expect.objectContaining({ trustedRelays: ['wss://trusted.example'], force: true }));
  });

  it('a permanent failure clears the topology, says why, and does not fall back', async () => {
    startBehaviour.next = [async () => { throw new Error('not on the allow-list'); }];
    const { deps, target, events } = setup();
    await expect(startSfuClient(target, deps, SFU, advert('https://sfu.example'))).rejects.toThrow('not on the allow-list');
    expect(target).toEqual({ pubkey: null, client: null });
    expect(events.onTopologyChange).toHaveBeenCalledWith(null);
    expect(events.onError).toHaveBeenCalledWith('Could not connect to the SFU: not on the allow-list');
    expect(clients).toHaveLength(1);
  });

  it('a cold-start RPC timeout is retried with a fresh client', async () => {
    vi.useFakeTimers();
    startBehaviour.next = [async () => { throw new Error('rpc timeout: getRouterRtpCapabilities'); }];
    const { deps, target } = setup();
    const done = startSfuClient(target, deps, SFU, advert('https://sfu.example'));
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    expect(clients).toHaveLength(2);
    expect(clients[0].close).toHaveBeenCalledWith(0);
    expect(target.client).toBe(clients[1]);
  });

  it('builds nothing when the call was left before it began', async () => {
    const { deps, target } = setup(false);
    await startSfuClient(target, deps, SFU, advert('https://sfu.example'));
    expect(clients).toHaveLength(0);
  });
});
