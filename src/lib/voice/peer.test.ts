import { EventEmitter } from 'node:events';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeMediaStreamTrack, installWebRtcMocks } from '@/test/mocks/webrtc';
import type { VoiceSignalPayload } from './types';
import { emptyVoiceMetrics } from './metrics';
import { DEAD_PEER_TIMEOUT_MS } from './control-channel';

const simplePeerFake = vi.hoisted(() => ({ instances: [] as MockSimplePeer[] }));

class MockSimplePeer extends EventEmitter {
  _pc: RTCPeerConnection;
  connected = false;
  destroyed = false;
  readonly initiator: boolean;
  readonly signaled: unknown[] = [];
  readonly sent: unknown[] = [];

  constructor(options: { initiator?: boolean; config?: RTCConfiguration } = {}) {
    super();
    this.initiator = options.initiator === true;
    this._pc = new RTCPeerConnection(options.config);
    simplePeerFake.instances.push(this);
  }

  signal(data: unknown) { this.signaled.push(data); }
  send(data: unknown) { this.sent.push(data); }
  addTrack(track: MediaStreamTrack, stream: MediaStream) { this._pc.addTrack(track, stream); }
  removeTrack(_track: MediaStreamTrack, _stream: MediaStream) {
    const sender = this._pc.getSenders().find((candidate) => candidate.track === _track);
    if (sender) this._pc.removeTrack(sender);
  }
  replaceTrack(oldTrack: MediaStreamTrack, newTrack: MediaStreamTrack) {
    const sender = this._pc.getSenders().find((candidate) => candidate.track === oldTrack);
    void sender?.replaceTrack(newTrack);
  }
  addTransceiver(kind: string, init?: RTCRtpTransceiverInit) {
    this._pc.addTransceiver(kind, init);
  }
  _needsNegotiation() {}
  destroy() { this.destroyed = true; this.emit('close'); }
}

vi.doMock('simple-peer', () => ({ default: MockSimplePeer }));

import type { Peer as PeerClass, PeerEvents } from './peer';

let Peer: typeof PeerClass;

beforeAll(async () => {
  ({ Peer } = await import('./peer'));
});

let webrtc: ReturnType<typeof installWebRtcMocks>;

beforeEach(() => {
  webrtc = installWebRtcMocks();
  simplePeerFake.instances.length = 0;
});

afterEach(() => {
  for (const instance of simplePeerFake.instances) instance.removeAllListeners();
  webrtc.uninstall();
  vi.useRealTimers();
});

function makePeer(overrides: Partial<ConstructorParameters<typeof Peer>[0]> = {}) {
  const sent: VoiceSignalPayload[] = [];
  const events: PeerEvents = {
    onRemoteTrack: vi.fn(),
    onRemoteTrackEnded: vi.fn(),
    onConnectionStateChange: vi.fn(),
  };
  const peer = new Peer({
    remotePubkey: 'b'.repeat(64),
    polite: false,
    sessionId: 'session',
    send: async (payload) => { sent.push(payload); },
    events,
    ...overrides,
  });
  return { peer, sent, events, simple: simplePeerFake.instances.at(-1)! };
}

describe('Peer simple-peer adapter', () => {
  it('uses the lexicographic polite role as simple-peer initiator selection', () => {
    const impolite = makePeer();
    expect(impolite.simple.initiator).toBe(true);
    impolite.peer.close();

    const polite = makePeer({ polite: true });
    expect(polite.simple.initiator).toBe(false);
    polite.peer.close();
  });

  it('wraps library signaling for the Nostr transport', async () => {
    const { peer, simple, sent } = makePeer();
    const offer = { type: 'offer', sdp: 'v=0' } as const;
    simple.emit('signal', offer);
    await Promise.resolve();
    expect(sent).toContainEqual(expect.objectContaining({
      type: 'peer',
      peerSignal: offer,
      sessionId: 'session',
    }));
    peer.close();
  });

  it('forwards inbound opaque signaling to simple-peer', async () => {
    const { peer, simple } = makePeer();
    const signal = { type: 'candidate', candidate: { candidate: 'candidate-a' } };
    await peer.handleSignal({ type: 'peer', peerSignal: signal, sessionId: 'remote', seq: 1 });
    expect(simple.signaled).toEqual([signal]);
    peer.close();
  });

  it('announces track kind and applies sender limits', async () => {
    const { peer, sent } = makePeer();
    const camera = new FakeMediaStreamTrack('video') as unknown as MediaStreamTrack;
    await peer.setLocalTrack('camera', camera);
    await peer.setLocalVideoCap({ maxBitrate: 1_000_000, maxFramerate: 24 });

    expect(sent).toContainEqual(expect.objectContaining({
      type: 'trackinfo',
      trackInfo: { trackId: camera.id, kind: 'camera' },
    }));
    const params = peer.pc.getSenders()[0].getParameters();
    expect(params.encodings?.[0].maxBitrate).toBe(1_000_000);
    expect(params.encodings?.[0].maxFramerate).toBe(24);
    peer.close();
  });

  it('gossips full peer snapshots over the library data channel', () => {
    const onControlPeerSnapshot = vi.fn();
    const { peer, simple } = makePeer({
      control: {
        selfBuild: 'test',
        metrics: emptyVoiceMetrics(),
        getCurrentPeers: () => ['c'.repeat(64)],
      },
      events: {
        onRemoteTrack: vi.fn(),
        onRemoteTrackEnded: vi.fn(),
        onConnectionStateChange: vi.fn(),
        onControlPeerSnapshot,
      },
    });
    simple.connected = true;
    simple.emit('connect');
    simple.emit('data', JSON.stringify({ type: 'peerSnapshot', peers: ['d'.repeat(64)], ts: 1 }));

    expect(simple.sent.some((value) => String(value).includes('peerSnapshot') || String(value).includes('hello'))).toBe(true);
    expect(onControlPeerSnapshot).toHaveBeenCalledWith(['d'.repeat(64)]);
    peer.close();
  });

  it('reports a connected peer when control heartbeats stop', async () => {
    vi.useFakeTimers();
    const onPeerDead = vi.fn();
    const { peer, simple } = makePeer({
      control: {
        selfBuild: 'test',
        metrics: emptyVoiceMetrics(),
        getCurrentPeers: () => [],
      },
      events: {
        onRemoteTrack: vi.fn(),
        onRemoteTrackEnded: vi.fn(),
        onConnectionStateChange: vi.fn(),
        onPeerDead,
      },
    });
    simple.connected = true;
    simple.emit('connect');

    await vi.advanceTimersByTimeAsync(DEAD_PEER_TIMEOUT_MS);

    expect(onPeerDead).toHaveBeenCalledWith('heartbeat-lost');
    peer.close();
  });

  it('publishes a relay bye and destroys the library peer once', async () => {
    const { peer, simple, sent } = makePeer();
    peer.close();
    peer.close();
    await Promise.resolve();
    expect(sent.filter((payload) => payload.type === 'bye')).toHaveLength(1);
    expect(simple.destroyed).toBe(true);
  });

  it('closes silently when the owner is rebuilding the connection', async () => {
    const { peer, simple, sent } = makePeer();
    peer.close({ notifyRemote: false });
    await Promise.resolve();
    expect(sent.some((payload) => payload.type === 'bye')).toBe(false);
    expect(simple.destroyed).toBe(true);
  });
});

describe('Peer session binding', () => {
  const answer = (sessionId?: string): VoiceSignalPayload => ({
    type: 'peer', peerSignal: { type: 'answer', sdp: 'v=0' }, sessionId: sessionId as string, seq: 1,
  });
  const offer = (sessionId: string): VoiceSignalPayload => ({
    type: 'peer', peerSignal: { type: 'offer', sdp: 'v=0' }, sessionId, seq: 1,
  });

  it('drops signals from a remote session other than the one it bound to', async () => {
    const { peer, simple } = makePeer();
    await peer.handleSignal(answer('remote-1'));
    await peer.handleSignal(answer('remote-old'));
    expect(simple.signaled).toHaveLength(1);
  });

  it('hands a new-session offer to its owner instead of feeding the old connection', async () => {
    const onRemoteSessionChanged = vi.fn();
    const { peer, simple, events } = makePeer();
    events.onRemoteSessionChanged = onRemoteSessionChanged;
    await peer.handleSignal(answer('remote-1'));
    const fresh = offer('remote-2');
    await peer.handleSignal(fresh);
    expect(onRemoteSessionChanged).toHaveBeenCalledWith(fresh);
    expect(simple.signaled).toHaveLength(1);
  });

  it('honours requestReset and room-full byes from any session', async () => {
    const onPeerDead = vi.fn();
    const { peer, events } = makePeer();
    events.onPeerDead = onPeerDead;
    await peer.handleSignal(answer('remote-1'));
    await peer.handleSignal({ type: 'requestReset', sessionId: 'remote-2', seq: 1 });
    await peer.handleSignal({ type: 'bye', byeReason: 'room-full', sessionId: 'client-id', seq: 0 });
    expect(onPeerDead.mock.calls.map((c) => c[0])).toEqual(['reset-requested', 'bye:room-full']);
  });

  it('ignores a stale bye from the connection it replaced', async () => {
    const onPeerDead = vi.fn();
    const { peer, events } = makePeer();
    events.onPeerDead = onPeerDead;
    await peer.handleSignal(answer('remote-2'));
    await peer.handleSignal({ type: 'bye', byeReason: 'local-leave', sessionId: 'remote-1', seq: 9 });
    expect(onPeerDead).not.toHaveBeenCalled();
  });

  it('accepts signals without a sessionId, as older clients send', async () => {
    const { peer, simple } = makePeer();
    await peer.handleSignal(answer('remote-1'));
    await peer.handleSignal(answer(undefined));
    expect(simple.signaled).toHaveLength(2);
  });

  it('sends requestReset under its own session', async () => {
    const { peer, sent } = makePeer({ sessionId: 'mine' });
    peer.requestReset();
    await Promise.resolve();
    expect(sent).toEqual([expect.objectContaining({ type: 'requestReset', sessionId: 'mine' })]);
    peer.close({ notifyRemote: false });
    peer.requestReset();
    await Promise.resolve();
    expect(sent).toHaveLength(1);
  });
});
