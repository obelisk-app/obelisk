/**
 * Lifecycle races in VoiceClient: what happens when `leave()` lands while
 * a join, a permission prompt or an SFU bootstrap is still in flight, and
 * what an SFU closing its room leaves behind. Each case here was a defect
 * found in round 7 (audits/obelisk/round7/14-voice-subsystem.md) and the
 * test was red before the fix it names.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installWebRtcMocks,
  installMediaDevicesMocks,
  flushMicrotasks,
  FakeMediaStream,
  FakeMediaStreamTrack,
} from '@tests/support/mocks/webrtc';
import type { VoicePresence, VoiceSignalPayload } from '@/services/voice/types';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const transportFake = vi.hoisted(() => {
  let rosterCb: ((roster: VoicePresence[]) => void) | null = null;
  let signalsCb: ((from: string, p: VoiceSignalPayload) => void) | null = null;
  const publishPresenceBeacon = vi.fn(async () => {});
  const publishLeavePresence = vi.fn(async () => {});
  const signalsUnsub = vi.fn(() => { signalsCb = null; });
  const rosterUnsub = vi.fn(() => { rosterCb = null; });
  /** When set, `subscribeSignals` waits on it before returning its unsub. */
  let signalsGate: Promise<void> | null = null;
  /** When set, `subscribeRoster` waits on it before returning its unsub. */
  let rosterGate: Promise<void> | null = null;
  /** When set, the next `subscribeRoster` rejects with it instead of subscribing. */
  let rosterFailure: Error | null = null;
  return {
    publishPresenceBeacon,
    publishLeavePresence,
    signalsUnsub,
    rosterUnsub,
    subscribeRoster: vi.fn(async (_id: string, cb: (r: VoicePresence[]) => void) => {
      if (rosterFailure) {
        const err = rosterFailure;
        rosterFailure = null;
        throw err;
      }
      if (rosterGate) await rosterGate;
      rosterCb = cb;
      return rosterUnsub;
    }),
    sendSignal: vi.fn(async () => {}),
    subscribeSignals: vi.fn(async (_id: string, _self: string, cb: (from: string, p: VoiceSignalPayload) => void) => {
      if (signalsGate) await signalsGate;
      signalsCb = cb;
      return signalsUnsub;
    }),
    getSelfPubkey: vi.fn(() => 'a'.repeat(64)),
    gateSignals: (p: Promise<void> | null) => { signalsGate = p; },
    gateRoster: (p: Promise<void> | null) => { rosterGate = p; },
    failNextRoster: (err: Error) => { rosterFailure = err; },
    fireRoster: (r: VoicePresence[]) => { rosterCb?.(r); },
    reset: () => {
      rosterCb = null; signalsCb = null; signalsGate = null; rosterGate = null; rosterFailure = null;
      publishPresenceBeacon.mockClear(); publishLeavePresence.mockClear();
      signalsUnsub.mockClear(); rosterUnsub.mockClear();
    },
  };
});

vi.mock('@/services/voice/transport', async (importOriginal) => ({
  publishPresenceBeacon: transportFake.publishPresenceBeacon,
  publishLeavePresence: transportFake.publishLeavePresence,
  subscribeRoster: transportFake.subscribeRoster,
  sendSignal: transportFake.sendSignal,
  subscribeSignals: transportFake.subscribeSignals,
  createVoiceTransport: vi.fn(() => ({
    publishPresenceBeacon: transportFake.publishPresenceBeacon,
    publishLeavePresence: transportFake.publishLeavePresence,
    subscribeRoster: transportFake.subscribeRoster,
    sendSignal: transportFake.sendSignal,
    subscribeSignals: transportFake.subscribeSignals,
  })),
  getSelfPubkey: transportFake.getSelfPubkey,
  transitiveParticipants: (await importOriginal<typeof import('@/services/voice/transport')>()).transitiveParticipants,
}));

const sfuControlFake = vi.hoisted(() => {
  let pick: { pubkey: string; trustedRelays: string[]; generalRelays: string[]; url: string | null; region: null; cap: null; createdAt: number } | null = null;
  return {
    pickSfu: vi.fn(async () => pick),
    publishSfuStart: vi.fn(async () => true),
    setPick: (pubkey: string | null) => {
      pick = pubkey ? { pubkey, trustedRelays: [], generalRelays: [], url: null, region: null, cap: null, createdAt: 1 } : null;
    },
    reset: () => { pick = null; },
  };
});
vi.mock('@/services/voice/sfu-control', () => ({
  pickSfu: sfuControlFake.pickSfu,
  publishSfuStart: sfuControlFake.publishSfuStart,
}));

const sfuClientFake = vi.hoisted(() => {
  type Events = {
    onRemoteTrack?: (t: unknown) => void;
    onRemoteTrackEnded?: (id: string) => void;
    onConnectionStateChange?: (s: string) => void;
    onPeersChange?: (pubkeys: string[]) => void;
  };
  /** `rejected` is a permanent failure (allow-list, auth): no retry ladder. */
  type Outcome = 'ok' | 'timeout' | 'rejected';
  const instances: Array<{ events: Events; started: boolean; closed: boolean }> = [];
  const outcomes: Outcome[] = [];
  class StubSfuClient {
    private readonly state: typeof instances[number];
    private readonly outcome: Outcome;
    constructor(opts: { events: Events }) {
      this.outcome = outcomes.shift() ?? 'ok';
      this.state = { events: opts.events, started: false, closed: false };
      instances.push(this.state);
    }
    async start(): Promise<void> {
      if (this.outcome === 'timeout') throw new Error('rpc timeout: getRouterRtpCapabilities');
      if (this.outcome === 'rejected') throw new Error('sfu: pubkey not on the allow-list');
      this.state.started = true;
    }
    async publishTrack(): Promise<void> {}
    async unpublishTrack(): Promise<void> {}
    async close(): Promise<void> { this.state.closed = true; }
  }
  return {
    SfuClient: StubSfuClient,
    instances,
    queue: (...o: Outcome[]) => { outcomes.push(...o); },
    reset: () => { instances.length = 0; outcomes.length = 0; },
  };
});
vi.mock('@/services/voice/sfu-client', () => ({ SfuClient: sfuClientFake.SfuClient }));

type ActiveCallEntry = { hostPubkey: string; status: string; participantCount: number; expiresAt: number; createdAt: number };
const bridgeFake = vi.hoisted(() => {
  const cbs: Array<(byChannel: Record<string, ActiveCallEntry>) => void> = [];
  const releaseCapacity = vi.fn();
  const bridge = {
    subscribeActiveCallByChannel: (cb: (byChannel: Record<string, ActiveCallEntry>) => void) => {
      cbs.push(cb);
      return () => { const i = cbs.indexOf(cb); if (i >= 0) cbs.splice(i, 1); };
    },
    waitForRelayAuth: vi.fn(async () => 'ok'),
    reserveVoiceRelayCapacity: vi.fn(() => releaseCapacity),
  };
  return {
    getBridge: vi.fn(async () => bridge),
    releaseCapacity,
    fire: (byChannel: Record<string, ActiveCallEntry>) => { for (const cb of [...cbs]) cb(byChannel); },
    reset: () => { cbs.length = 0; releaseCapacity.mockClear(); },
  };
});
vi.mock('@/services/nostr-bridge/facade/client', () => ({ getBridge: bridgeFake.getBridge }));

import { VoiceClient } from '@/services/voice/client';
import { Peer } from '@/services/voice/peer';
import { silentVoiceUiSink } from '@/services/voice/ui-sink';

const SELF = 'a'.repeat(64);
const PEER1 = 'b'.repeat(64);
const SFU = 'f'.repeat(64);

let webrtc: ReturnType<typeof installWebRtcMocks>;
let media: ReturnType<typeof installMediaDevicesMocks>;

function presence(pubkey: string): VoicePresence {
  return { pubkey, channelId: 'ch1', createdAt: 1, expiresAt: 9999999999, connectedTo: [], videoTracks: [], isSfu: false };
}

function gum(): { getUserMedia: ReturnType<typeof vi.fn>; stream: FakeMediaStream; track: FakeMediaStreamTrack; release: () => void } {
  const track = new FakeMediaStreamTrack('audio');
  const stream = new FakeMediaStream([track]);
  const gate = deferred<void>();
  const getUserMedia = vi.fn(async () => { await gate.promise; return stream as unknown as MediaStream; });
  (globalThis.navigator as unknown as { mediaDevices: { getUserMedia: unknown } }).mediaDevices.getUserMedia = getUserMedia;
  return { getUserMedia, stream, track, release: () => gate.resolve() };
}

beforeEach(() => {
  webrtc = installWebRtcMocks();
  media = installMediaDevicesMocks();
  transportFake.reset();
  sfuControlFake.reset();
  sfuClientFake.reset();
  bridgeFake.reset();
});

afterEach(() => {
  webrtc.uninstall();
  media.uninstall();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('microphone release on leave', () => {
  it('a microphone granted after leave() is stopped, not kept hot on a dead client', async () => {
    const client = new VoiceClient('ch1', { members: [SELF], uiSink: silentVoiceUiSink() });
    await client.join();
    const mic = gum();
    // The user clicks unmute; the browser shows its permission prompt...
    const enabling = client.setMicEnabled(true);
    // ...and they leave the call before answering it.
    await client.leave();
    // Then they click Allow.
    mic.release();
    await enabling;
    expect(mic.track.readyState).toBe('ended');
    expect(client.getLocalTracks().mic).toBeNull();
  });

  it('releases the microphone even when a peer refuses to close', async () => {
    vi.spyOn(Peer.prototype, 'close').mockImplementation(() => { throw new Error('destroy exploded'); });
    const client = new VoiceClient('ch1', { members: [SELF, PEER1], uiSink: silentVoiceUiSink() });
    await client.join();
    transportFake.fireRoster([presence(PEER1)]);
    await flushMicrotasks(8);
    const mic = gum();
    mic.release();
    await client.setMicEnabled(true);
    expect(client.getLocalTracks().mic).toBe(mic.track as unknown as MediaStreamTrack);

    await client.leave();

    expect(mic.track.readyState).toBe('ended');
    expect(client.getLocalTracks().mic).toBeNull();
    expect(client.isJoined()).toBe(false);
  });
});

describe('leave() during join', () => {
  it('does not leave subscriptions or a beacon interval behind when leave() lands mid-join', async () => {
    vi.useFakeTimers();
    const gate = deferred<void>();
    transportFake.gateSignals(gate.promise);
    const client = new VoiceClient('ch1', { members: [SELF], uiSink: silentVoiceUiSink() });
    const joining = client.join();
    await flushMicrotasks(4);
    await client.leave();
    expect(client.isJoined()).toBe(false);
    // The relay answers the signals REQ after we have already left.
    gate.resolve();
    await joining;
    await flushMicrotasks(8);

    // Whatever was opened late must be closed again, and nothing may be published.
    expect(transportFake.signalsUnsub).toHaveBeenCalledTimes(transportFake.subscribeSignals.mock.calls.length);
    expect(transportFake.rosterUnsub).toHaveBeenCalledTimes(transportFake.subscribeRoster.mock.calls.length);
    expect(transportFake.publishPresenceBeacon).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(transportFake.publishPresenceBeacon).not.toHaveBeenCalled();
  });

  it('closes the signals REQ it already opened when leave() lands while the roster REQ is being opened', async () => {
    vi.useFakeTimers();
    const gate = deferred<void>();
    transportFake.gateRoster(gate.promise);
    const client = new VoiceClient('ch1', { members: [SELF], uiSink: silentVoiceUiSink() });
    const joining = client.join();
    await flushMicrotasks(8);
    expect(transportFake.subscribeSignals).toHaveBeenCalledTimes(1);
    await client.leave();
    gate.resolve();
    await joining;
    await flushMicrotasks(8);

    expect(transportFake.signalsUnsub).toHaveBeenCalledTimes(1);
    expect(transportFake.rosterUnsub).toHaveBeenCalledTimes(1);
    expect(transportFake.publishPresenceBeacon).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(transportFake.publishPresenceBeacon).not.toHaveBeenCalled();
  });

  it('does not build a fresh SfuClient when leave() lands during a bootstrap retry delay', async () => {
    sfuControlFake.setPick(SFU);
    sfuClientFake.queue('timeout', 'ok');
    const onTopologyChange = vi.fn();
    const client = new VoiceClient('ch1', { members: [SELF], expectSfu: true, uiSink: silentVoiceUiSink(), events: { onTopologyChange } });
    vi.useFakeTimers();
    const joining = client.join();
    // Attempt 0: 350 ms settle, then the rpc timeout. We are now inside the 2 s retry delay.
    await vi.advanceTimersByTimeAsync(500);
    expect(sfuClientFake.instances.length).toBe(1);
    await client.leave();
    await vi.advanceTimersByTimeAsync(5_000);
    await joining;
    // Nothing may outlive the leave: no second client, no topology event.
    expect(sfuClientFake.instances.length).toBe(1);
    expect(sfuClientFake.instances[0]!.closed).toBe(true);
    expect(onTopologyChange).not.toHaveBeenCalled();
  });
});

describe('the beacon roster never decides the topology (F12)', () => {
  it('an isSfu beacon in a mesh channel admits a pseudo-member and flips nothing', async () => {
    const onTopologyChange = vi.fn();
    const client = new VoiceClient('ch1', { members: [SELF, PEER1], uiSink: silentVoiceUiSink(), events: { onTopologyChange } });
    await client.join();
    transportFake.fireRoster([presence(PEER1), { ...presence(SFU), isSfu: true }]);
    await flushMicrotasks(8);
    // The tag admits the SFU through the membership filter (it is not in
    // `members`), so it is dialed as an ordinary polite mesh peer...
    expect(client.getParticipants().sort()).toEqual([PEER1, SFU].sort());
    // ...and nothing else: no SFU mode, no SfuClient, no pickSfu, no event.
    expect(client.getSfuPubkey()).toBeNull();
    expect(sfuClientFake.instances).toHaveLength(0);
    expect(sfuControlFake.pickSfu).not.toHaveBeenCalled();
    expect(onTopologyChange).not.toHaveBeenCalled();
    await client.leave();
  });
});

describe('a join that fails leaves the client idle (F11)', () => {
  it('after the SFU rejects the bootstrap, isJoined() is false and the next join() really retries', async () => {
    sfuControlFake.setPick(SFU);
    sfuClientFake.queue('rejected', 'ok');
    const onError = vi.fn();
    const client = new VoiceClient('ch1', { members: [SELF], expectSfu: true, uiSink: silentVoiceUiSink(), events: { onError } });
    await expect(client.join()).rejects.toThrow(/allow-list/);
    expect(onError).toHaveBeenCalledTimes(1);
    // The failed join must not strand the client as "joined": a client that
    // says it is in the call while nothing is running cannot be retried
    // (join() returns early) and cannot be left (nothing to leave).
    expect(client.isJoined()).toBe(false);
    await client.join();
    expect(client.isJoined()).toBe(true);
    expect(sfuClientFake.instances.length).toBe(2);
    expect(sfuClientFake.instances[1]!.started).toBe(true);
    expect(client.getSfuPubkey()).toBe(SFU);
    await client.leave();
  });

  it('after the roster subscription fails, the signals subscription and the relay reservation it already took are released', async () => {
    transportFake.failNextRoster(new Error('relay CLOSED: rate-limited'));
    const client = new VoiceClient('ch1', { members: [SELF], uiSink: silentVoiceUiSink() });
    await expect(client.join()).rejects.toThrow(/rate-limited/);
    expect(client.isJoined()).toBe(false);
    // enterMeshMode had already opened the signals REQ and reserved relay
    // capacity before subscribeRoster threw; both must be given back.
    expect(transportFake.subscribeSignals).toHaveBeenCalledTimes(1);
    expect(transportFake.signalsUnsub).toHaveBeenCalledTimes(1);
    expect(bridgeFake.releaseCapacity).toHaveBeenCalledTimes(1);
    expect(transportFake.publishPresenceBeacon).not.toHaveBeenCalled();
    // And the retry is a real join, not a no-op on a client that thinks it is in.
    await client.join();
    expect(client.isJoined()).toBe(true);
    expect(transportFake.subscribeRoster).toHaveBeenCalledTimes(2);
    expect(transportFake.publishPresenceBeacon).toHaveBeenCalledTimes(1);
    await client.leave();
  });
});

describe('remote SFU closure', () => {
  async function joinSfu(events: { onTopologyChange?: (s: string | null) => void; onRemoteTracksChange?: (t: unknown[]) => void; onError?: (m: string) => void } = {}) {
    sfuControlFake.setPick(SFU);
    const client = new VoiceClient('ch1', { members: [SELF, PEER1], expectSfu: true, uiSink: silentVoiceUiSink(), events });
    await client.join();
    await flushMicrotasks(20);
    return client;
  }

  it('drops the forwarded tracks and their speaking detectors when the SFU closes the room', async () => {
    const onRemoteTracksChange = vi.fn();
    const client = await joinSfu({ onRemoteTracksChange });
    const sfu = sfuClientFake.instances[0]!;
    const stream = new FakeMediaStream([new FakeMediaStreamTrack('audio')]);
    sfu.events.onRemoteTrack?.({ pubkey: PEER1, trackId: 't1', kind: 'audio', stream, consumer: { track: { enabled: true } } });
    expect(client.getRemoteTracks().map((t) => t.trackId)).toEqual(['t1']);

    bridgeFake.fire({ ch1: { hostPubkey: SELF, status: 'active', participantCount: 1, expiresAt: 9_999_999_999, createdAt: 1 } });
    await flushMicrotasks(5);
    bridgeFake.fire({});
    await flushMicrotasks(5);

    expect(sfu.closed).toBe(true);
    expect(client.getRemoteTracks()).toEqual([]);
    expect(onRemoteTracksChange).toHaveBeenLastCalledWith([]);
    expect(client.getConnectedPubkeys()).not.toContain(SFU);
    await client.leave();
  });

  it('reconnects to the SFU after it closed the room instead of staying dead until a rejoin', async () => {
    const onTopologyChange = vi.fn();
    const client = await joinSfu({ onTopologyChange });
    vi.useFakeTimers();
    bridgeFake.fire({ ch1: { hostPubkey: SELF, status: 'active', participantCount: 1, expiresAt: 9_999_999_999, createdAt: 1 } });
    await flushMicrotasks(5);
    bridgeFake.fire({});
    await flushMicrotasks(5);
    expect(onTopologyChange.mock.calls.map((c) => c[0])).toEqual([SFU, null]);

    // Rejoin delay (2 s) + start settle (350 ms), with slack.
    await vi.advanceTimersByTimeAsync(3_000);

    expect(sfuClientFake.instances.length).toBe(2);
    expect(sfuClientFake.instances[1]!.started).toBe(true);
    expect(client.getSfuPubkey()).toBe(SFU);
    expect(onTopologyChange.mock.calls.map((c) => c[0])).toEqual([SFU, null, SFU]);
    vi.useRealTimers();
    await client.leave();
  });

  it('does not reconnect when the user leaves during the rejoin delay', async () => {
    const onTopologyChange = vi.fn();
    const client = await joinSfu({ onTopologyChange });
    vi.useFakeTimers();
    bridgeFake.fire({ ch1: { hostPubkey: SELF, status: 'active', participantCount: 1, expiresAt: 9_999_999_999, createdAt: 1 } });
    await flushMicrotasks(5);
    bridgeFake.fire({});
    await flushMicrotasks(5);
    await client.leave();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sfuClientFake.instances.length).toBe(1);
    expect(onTopologyChange.mock.calls.map((c) => c[0])).toEqual([SFU, null]);
  });
});

describe('bridge failures are reported, not swallowed', () => {
  it('joins mesh without the relay reservation when the bridge is unavailable, and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // The reservation is the first getBridge() of enterMeshMode.
    bridgeFake.getBridge.mockRejectedValueOnce(new Error('bridge not ready'));
    const client = new VoiceClient('ch1', { members: [SELF], uiSink: silentVoiceUiSink() });
    await client.join();
    expect(client.isJoined()).toBe(true);
    expect(transportFake.publishPresenceBeacon).toHaveBeenCalledTimes(1);
    expect(bridgeFake.releaseCapacity).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      '[voice] relay capacity reservation unavailable; mesh subscriptions may hit the relay cap',
      expect.any(Error),
    );
    await client.leave();
  });
});

describe('listener failures are reported, not swallowed', () => {
  it('warns when a remote-tracks listener throws and keeps notifying the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = new VoiceClient('ch1', { members: [SELF], uiSink: silentVoiceUiSink() });
    const good = vi.fn();
    client.subscribeRemoteTracks(() => { throw new Error('sink exploded'); });
    client.subscribeRemoteTracks(good);
    expect(warn).toHaveBeenCalledWith('[voice] remote-tracks listener threw on subscribe', expect.any(Error));
    await client.join();
    // Any remote-track emit must reach the healthy listener and report the broken one.
    client.setDeafenEnabled(false);
    await client.leave(); // leave() emits remote tracks ([]) on the way out
    expect(warn).toHaveBeenCalledWith('[voice] remote-tracks listener threw', expect.any(Error));
    expect(good).toHaveBeenLastCalledWith([]);
  });
});
