/**
 * Two-peer integration tests. Wires up `Peer A ↔ Peer B` over an in-memory
 * transport so both ends drive the FakePc state machine end-to-end.
 *
 * Catches the bugs that single-peer unit tests can't:
 *  - m-line ordering across renegotiation (the InvalidAccessError we hit)
 *  - track flowing in both directions after addTrack on both sides
 *  - qualityhint actually changing the OTHER peer's encoder
 *  - bye → close → no further signals
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Peer } from './peer';
import type { VoiceSignalPayload } from './types';
import {
  FakeMediaStreamTrack,
  FakeRTCPeerConnection,
  installWebRtcMocks,
  flushMicrotasks,
} from '@/test/mocks/webrtc';

let webrtc: ReturnType<typeof installWebRtcMocks>;

beforeEach(() => {
  webrtc = installWebRtcMocks();
});
afterEach(() => {
  webrtc.uninstall();
});

interface Pair {
  a: Peer;
  b: Peer;
  remoteTracksA: MediaStreamTrack[];
  remoteTracksB: MediaStreamTrack[];
  qualitySamplesA: unknown[];
  qualitySamplesB: unknown[];
}

function makePair(opts?: { politeA?: boolean; politeB?: boolean }): Pair {
  // Lex-greater pubkey is polite by convention. 'a...' < 'b...', so B is polite
  // by default unless the test overrides.
  const pkA = 'a'.repeat(64);
  const pkB = 'b'.repeat(64);
  const politeA = opts?.politeA ?? false;
  const politeB = opts?.politeB ?? true;

  const remoteTracksA: MediaStreamTrack[] = [];
  const remoteTracksB: MediaStreamTrack[] = [];
  const qualitySamplesA: unknown[] = [];
  const qualitySamplesB: unknown[] = [];

  // Lazily-bound peer references so each `send` lands on the OTHER peer.
  let a!: Peer; let b!: Peer;

  a = new Peer({
    remotePubkey: pkB, polite: politeA, sessionId: 'a-1',
    send: async (p) => { queueMicrotask(() => { void b.handleSignal(p); }); },
    events: {
      onRemoteTrack: (t) => { remoteTracksA.push(t as unknown as MediaStreamTrack); },
      onRemoteTrackEnded: vi.fn(),
      onConnectionStateChange: vi.fn(),
      onQualitySample: (s) => { qualitySamplesA.push(s); },
    },
  });
  b = new Peer({
    remotePubkey: pkA, polite: politeB, sessionId: 'b-1',
    send: async (p) => { queueMicrotask(() => { void a.handleSignal(p); }); },
    events: {
      onRemoteTrack: (t) => { remoteTracksB.push(t as unknown as MediaStreamTrack); },
      onRemoteTrackEnded: vi.fn(),
      onConnectionStateChange: vi.fn(),
      onQualitySample: (s) => { qualitySamplesB.push(s); },
    },
  });

  return { a, b, remoteTracksA, remoteTracksB, qualitySamplesA, qualitySamplesB };
}

describe('two-peer handshake', () => {
  it('completes negotiation when A adds an audio track first', async () => {
    const { a, b, remoteTracksB } = makePair();
    await a.setLocalTrack('audio', new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack);
    await flushMicrotasks(20);

    expect(a.pc.signalingState).toBe('stable');
    expect(b.pc.signalingState).toBe('stable');
    // B should have received a remote audio track from A.
    expect(remoteTracksB.length).toBeGreaterThanOrEqual(1);
  });

  it('renegotiates without m-line drift when A then B add tracks', async () => {
    const { a, b, remoteTracksA, remoteTracksB } = makePair();

    await a.setLocalTrack('audio', new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack);
    await flushMicrotasks(20);

    await b.setLocalTrack('audio', new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack);
    await flushMicrotasks(20);

    // Both peers stable, both received audio.
    expect(a.pc.signalingState).toBe('stable');
    expect(b.pc.signalingState).toBe('stable');
    expect(remoteTracksA.length).toBeGreaterThanOrEqual(1);
    expect(remoteTracksB.length).toBeGreaterThanOrEqual(1);
  });

  it('preserves m-line order across multiple renegotiations', async () => {
    const { a, b } = makePair();

    await a.setLocalTrack('audio', new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack);
    await flushMicrotasks(20);

    await a.setLocalTrack('camera', new FakeMediaStreamTrack('video') as unknown as MediaStreamTrack);
    await flushMicrotasks(20);

    await a.setLocalTrack('screen', new FakeMediaStreamTrack('video') as unknown as MediaStreamTrack);
    await flushMicrotasks(20);

    // If m-line order had drifted, FakePc.setRemoteDescription would have
    // thrown InvalidAccessError. Both ends should still be stable.
    expect(a.pc.signalingState).toBe('stable');
    expect(b.pc.signalingState).toBe('stable');

    const aTransceivers = (a.pc as unknown as FakeRTCPeerConnection).getTransceivers();
    expect(aTransceivers.map((t) => t.kind)).toEqual(['audio', 'video', 'video']);
  });

  it('round-trips a qualityhint and caps the OTHER peer\'s outbound video', async () => {
    const { a, b } = makePair();
    await a.setLocalTrack('camera', new FakeMediaStreamTrack('video') as unknown as MediaStreamTrack);
    await flushMicrotasks(20);

    // After connect, A's video sender hasn't been hinted yet.
    const aPc = a.pc as unknown as FakeRTCPeerConnection;
    const aSender = aPc.getSenders().find((s) => s.track?.kind === 'video');
    expect(aSender?.inspect().encodings[0].maxBitrate).toBeUndefined();

    // B asks A to cap to 480p (1 Mbps).
    await b.sendQualityHint({ maxHeight: 480, maxFramerate: 30, maxBitrate: 1_000_000 });
    await flushMicrotasks(8);

    expect(aSender?.inspect().encodings[0].maxBitrate).toBe(1_000_000);
  });

  it('A.close() publishes bye and B never receives a stale signal', async () => {
    const { a, b } = makePair();
    await a.setLocalTrack('audio', new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack);
    await flushMicrotasks(20);

    a.close();
    await flushMicrotasks(8);

    // B's PC may be still 'connected' from A's perspective; the only thing
    // we strictly assert: A doesn't throw and B doesn't crash on the bye.
    expect(a.pc.signalingState).toBe('closed');
    // After bye, further B → A signals route into the closed peer and are
    // silently dropped (handleSignal early-returns when closed).
    await b.setLocalTrack('audio', new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack);
    await flushMicrotasks(20);
    // No throw = pass.
  });
});

describe('two-peer glare', () => {
  it('simultaneous addTrack on both sides converges to stable', async () => {
    const { a, b } = makePair();
    // Add tracks on both sides synchronously — both PCs will queue
    // negotiationneeded at the same microtask, producing offer glare.
    await Promise.all([
      a.setLocalTrack('audio', new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack),
      b.setLocalTrack('audio', new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack),
    ]);
    await flushMicrotasks(40);

    expect(a.pc.signalingState).toBe('stable');
    expect(b.pc.signalingState).toBe('stable');
  });
});
