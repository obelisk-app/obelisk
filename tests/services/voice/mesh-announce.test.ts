import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MeshAnnouncer, type MeshAnnouncerDeps } from '@/services/voice/mesh-announce';
import { emptyVoiceMetrics } from '@/services/voice/metrics';

function setup() {
  const connected = new Set<string>();
  const publish = vi.fn().mockResolvedValue(undefined);
  let joined = true;
  const deps = {
    channelId: 'room', remoteSigning: true,
    transport: { publishPresenceBeacon: publish },
    metrics: emptyVoiceMetrics(),
    room: { connectedPubkeys: connected, peers: new Map() },
    localMedia: { videoTracks: () => [] },
    isJoined: () => joined, sfuActive: () => false, sfuPubkey: () => null,
    meshKnownPubkeys: () => [...connected],
  } as unknown as MeshAnnouncerDeps;
  return { announcer: new MeshAnnouncer(deps), publish, connected, leave: () => { joined = false; } };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('coalesces slow signing and publishes only the latest changed state afterward', async () => {
  const { announcer, publish, connected } = setup();
  let finish!: () => void;
  publish.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const first = announcer.publishBeacon();
  announcer.startCadence();
  connected.add('alice'); announcer.scheduleBeaconRefresh();
  await vi.advanceTimersByTimeAsync(65_000);
  expect(publish).toHaveBeenCalledTimes(1);
  connected.add('bob'); finish(); await first;
  await vi.advanceTimersByTimeAsync(250);
  expect(publish).toHaveBeenCalledTimes(2);
  expect(publish.mock.calls[1][1]).toEqual(['alice', 'bob']);
  announcer.stop();
});

it('skips unchanged refreshes and resets the 60-second heartbeat after changes', async () => {
  const { announcer, publish, connected } = setup();
  await announcer.publishBeacon(); announcer.startCadence(); announcer.startCadence();
  announcer.scheduleBeaconRefresh(); await vi.advanceTimersByTimeAsync(59_000);
  expect(publish).toHaveBeenCalledTimes(3);
  connected.add('alice'); announcer.scheduleBeaconRefresh();
  await vi.advanceTimersByTimeAsync(1_000);
  expect(publish).toHaveBeenCalledTimes(4);
  await vi.advanceTimersByTimeAsync(59_250);
  expect(publish).toHaveBeenCalledTimes(5);
  announcer.stop();
});

it('cancels queued updates and cadence when leaving during signing', async () => {
  const { announcer, publish, connected, leave } = setup();
  let finish!: () => void;
  publish.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const first = announcer.publishBeacon(); announcer.startCadence();
  connected.add('alice'); announcer.scheduleBeaconRefresh();
  await vi.advanceTimersByTimeAsync(300);
  leave(); announcer.stop(); finish(); await first;
  await vi.advanceTimersByTimeAsync(180_000);
  expect(publish).toHaveBeenCalledTimes(1);
});

it('retries a failed heartbeat on the next interval without overlapping signing', async () => {
  const { announcer, publish } = setup();
  await announcer.publishBeacon(); announcer.startCadence();
  await vi.advanceTimersByTimeAsync(8_000);
  publish.mockClear();
  publish.mockRejectedValueOnce(new Error('signer unavailable'));
  await vi.advanceTimersByTimeAsync(60_000);
  expect(publish).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(59_999);
  expect(publish).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(publish).toHaveBeenCalledTimes(2);
  announcer.stop();
});

it('fresh entry waits for old signing to finish then announces again', async () => {
  const { announcer, publish } = setup();
  let finish!: () => void;
  publish.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  const old = announcer.publishBeacon();
  announcer.stop();
  const next = announcer.publishBeacon();
  expect(publish).toHaveBeenCalledTimes(1);
  finish(); await old; await next;
  expect(publish).toHaveBeenCalledTimes(2);
  announcer.stop();
});

it('reannounces twice during remote-signer startup and cancels retries on leave', async () => {
  const { announcer, publish } = setup();
  await announcer.publishBeacon(); announcer.startCadence();
  await vi.advanceTimersByTimeAsync(2_000);
  expect(publish).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(6_000);
  expect(publish).toHaveBeenCalledTimes(3);
  announcer.stop();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(publish).toHaveBeenCalledTimes(3);
});
