/**
 * Tests for the Peer class — the perfect-negotiation wrapper around
 * RTCPeerConnection.
 *
 * Strategy: install the FakePc mock and drive single peers through realistic
 * scenarios (addTrack → offer, glare resolution, stats monitor lifecycle).
 * Two-peer round-trips live in `peer-pair.integration.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Peer, type PeerEvents } from './peer';
import type { VoiceSignalPayload } from './types';
import {
  FakeRTCPeerConnection,
  FakeMediaStreamTrack,
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

interface MakePeerOpts {
  remotePubkey?: string;
  polite?: boolean;
  events?: Partial<PeerEvents>;
}

function makePeer(opts: MakePeerOpts = {}) {
  const sent: VoiceSignalPayload[] = [];
  const peer = new Peer({
    remotePubkey: opts.remotePubkey ?? 'b'.repeat(64),
    polite: opts.polite ?? true,
    sessionId: 'sess-1',
    send: async (p) => { sent.push(p); },
    events: {
      onRemoteTrack: vi.fn(),
      onRemoteTrackEnded: vi.fn(),
      onConnectionStateChange: vi.fn(),
      onQualitySample: vi.fn(),
      ...(opts.events ?? {}),
    },
  });
  return { peer, sent };
}

describe('Peer.setLocalTrack', () => {
  it('addTrack on the underlying PC and remembers the sender', async () => {
    const { peer } = makePeer();
    const track = new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack;
    await peer.setLocalTrack('audio', track);

    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    expect(pc.getSenders()).toHaveLength(1);
    expect(pc.getSenders()[0].track).toBe(track);
  });

  it('replaceTrack on a second call with the same kind, no new sender', async () => {
    const { peer } = makePeer();
    const t1 = new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack;
    const t2 = new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack;
    await peer.setLocalTrack('audio', t1);
    await peer.setLocalTrack('audio', t2);

    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    expect(pc.getSenders()).toHaveLength(1);
    expect(pc.getSenders()[0].track).toBe(t2);
  });

  it('removeTrack(null) clears the local-senders map; re-add reuses the m-line', async () => {
    const { peer } = makePeer();
    const track = new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack;
    await peer.setLocalTrack('audio', track);
    await peer.setLocalTrack('audio', null);
    // Re-adding finds the recvonly transceiver from before and promotes it.
    const replacement = new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack;
    await peer.setLocalTrack('audio', replacement);
    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    expect(pc.getSenders()).toHaveLength(1);
    expect(pc.getSenders()[0].track).toBe(replacement);
  });

  it('triggers an offer publication via the send callback', async () => {
    const { peer, sent } = makePeer();
    const track = new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack;
    await peer.setLocalTrack('audio', track);
    await flushMicrotasks(8);

    expect(sent.find((s) => s.type === 'offer')).toBeDefined();
    expect(sent.find((s) => s.type === 'trackinfo')).toBeDefined();
  });
});

describe('Peer perfect-negotiation glare', () => {
  it('polite peer rolls back when an offer arrives during its own offer', async () => {
    const { peer, sent } = makePeer({ polite: true });
    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    // Manually drive into 'have-local-offer' to simulate "we just sent our offer".
    await pc.setLocalDescription();
    expect(pc.signalingState).toBe('have-local-offer');

    // Build a remote offer SDP from a sibling FakePc so it parses.
    const remotePc = new FakeRTCPeerConnection();
    remotePc.addTrack(new FakeMediaStreamTrack('audio'));
    await remotePc.setLocalDescription();
    const remoteOffer = remotePc.localDescription!;

    await peer.handleSignal({ type: 'offer', sdp: remoteOffer.sdp, sessionId: 's', seq: 1 });
    // After politely rolling back + applying the offer + creating an answer,
    // we should be stable again and have published an answer.
    expect(pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer').toBe(true);
    expect(sent.find((s) => s.type === 'answer')).toBeDefined();
  });

  it('impolite peer ignores a colliding remote offer', async () => {
    const { peer, sent } = makePeer({ polite: false });
    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    await pc.setLocalDescription();
    const before = pc.signalingState;

    const remotePc = new FakeRTCPeerConnection();
    remotePc.addTrack(new FakeMediaStreamTrack('audio'));
    await remotePc.setLocalDescription();
    const remoteOffer = remotePc.localDescription!;

    await peer.handleSignal({ type: 'offer', sdp: remoteOffer.sdp, sessionId: 's', seq: 1 });
    // Impolite ignores — state shouldn't have advanced to 'have-remote-offer'.
    expect(pc.signalingState).toBe(before);
    // No answer should have been generated.
    expect(sent.find((s) => s.type === 'answer')).toBeUndefined();
  });

  it('drops out-of-state answers without throwing', async () => {
    const { peer } = makePeer();
    // No outstanding offer — apply an answer should be ignored, not blow up.
    await expect(peer.handleSignal({ type: 'answer', sdp: 'v=0\r\na=fake-payload:{"type":"answer","nonce":1,"mlines":[]}\r\n', sessionId: 's', seq: 1 })).resolves.toBeUndefined();
  });
});

describe('Peer encoder-cap timing', () => {
  it('does NOT call setParameters before connectionState becomes connected', async () => {
    const { peer } = makePeer();
    const audio = new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack;
    await peer.setLocalTrack('audio', audio);
    await flushMicrotasks(4);

    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    const audioSender = pc.getSenders()[0];
    // Before connect, encodings are still the FakePc default (empty {}).
    expect(audioSender.inspect().encodings[0].maxBitrate).toBeUndefined();
  });

  it('applies the audio bitrate cap when connection becomes connected', async () => {
    const { peer } = makePeer();
    const audio = new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack;
    await peer.setLocalTrack('audio', audio);
    await flushMicrotasks(4);

    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    pc.forceState('connected');
    await flushMicrotasks(8);

    const audioSender = pc.getSenders()[0];
    expect(audioSender.inspect().encodings[0].maxBitrate).toBe(128_000);
  });

  it('applies a video bitrate cap when setLocalVideoCap is called after connected', async () => {
    const { peer } = makePeer();
    const video = new FakeMediaStreamTrack('video') as unknown as MediaStreamTrack;
    await peer.setLocalTrack('camera', video);
    await flushMicrotasks(4);

    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    pc.forceState('connected');
    await flushMicrotasks(8);

    await peer.setLocalVideoCap({ maxBitrate: 1_000_000, maxFramerate: 30 });

    const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
    expect(videoSender?.inspect().encodings[0].maxBitrate).toBe(1_000_000);
    expect(videoSender?.inspect().encodings[0].maxFramerate).toBe(30);
  });

  it('setLocalVideoCap is a no-op until the PC is connected (avoids Safari InvalidStateError)', async () => {
    const { peer } = makePeer();
    const video = new FakeMediaStreamTrack('video') as unknown as MediaStreamTrack;
    await peer.setLocalTrack('camera', video);

    // Set cap BEFORE connect — should not write to sender params.
    await peer.setLocalVideoCap({ maxBitrate: 800_000, maxFramerate: 30 });

    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    const sender = pc.getSenders()[0];
    expect(sender.inspect().encodings[0].maxBitrate).toBeUndefined();

    // After connect, the deferred apply runs and cap takes effect.
    pc.forceState('connected');
    await flushMicrotasks(8);
    expect(sender.inspect().encodings[0].maxBitrate).toBe(800_000);
  });
});

describe('Peer qualityhint round-trip', () => {
  it('inbound qualityhint caps our outbound video sender to min(local, remote)', async () => {
    const { peer } = makePeer();
    const video = new FakeMediaStreamTrack('video') as unknown as MediaStreamTrack;
    await peer.setLocalTrack('camera', video);

    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    pc.forceState('connected');
    await flushMicrotasks(8);

    // User picked 1080p locally (4 Mbps); remote asks for 480p (1 Mbps).
    await peer.setLocalVideoCap({ maxBitrate: 4_000_000, maxFramerate: 30 });
    await peer.handleSignal({
      type: 'qualityhint',
      qualityHint: { maxHeight: 480, maxFramerate: 30, maxBitrate: 1_000_000 },
      sessionId: 's', seq: 1,
    });

    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
    expect(sender?.inspect().encodings[0].maxBitrate).toBe(1_000_000);
  });

  it('outbound sendQualityHint publishes the right payload', async () => {
    const { peer, sent } = makePeer();
    await peer.sendQualityHint({ maxHeight: 720, maxFramerate: 30, maxBitrate: 2_500_000 });
    const hint = sent.find((s) => s.type === 'qualityhint');
    expect(hint?.qualityHint).toEqual({ maxHeight: 720, maxFramerate: 30, maxBitrate: 2_500_000 });
  });
});

describe('Peer stats monitor', () => {
  it('starts on connected, fires onQualitySample, stops on close', async () => {
    vi.useFakeTimers();
    const onSample = vi.fn();
    const { peer } = makePeer({ events: { onRemoteTrack: vi.fn(), onRemoteTrackEnded: vi.fn(), onConnectionStateChange: vi.fn(), onQualitySample: onSample } });
    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    pc.fakeStats.set('cp1', { type: 'candidate-pair', nominated: true, currentRoundTripTime: 0.05 });
    pc.fakeStats.set('rtp-in', { type: 'inbound-rtp', jitter: 0.01, packetsLost: 0, packetsReceived: 100 });

    pc.forceState('connected');
    await flushMicrotasks(4);
    // First poll fires after 2s.
    await vi.advanceTimersByTimeAsync(2100);
    expect(onSample).toHaveBeenCalled();
    const sample = onSample.mock.calls[0][0];
    expect(sample.rttMs).toBe(50);

    peer.close();
    onSample.mockClear();
    await vi.advanceTimersByTimeAsync(2100);
    expect(onSample).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('Peer.close', () => {
  it('publishes a bye signal exactly once', async () => {
    const { peer, sent } = makePeer();
    peer.close();
    peer.close(); // idempotent
    expect(sent.filter((s) => s.type === 'bye')).toHaveLength(1);
  });

  it('does nothing when handleSignal arrives after close', async () => {
    const { peer, sent } = makePeer();
    peer.close();
    sent.length = 0;
    await peer.handleSignal({ type: 'offer', sdp: 'v=0\r\n', sessionId: 's', seq: 1 });
    expect(sent).toHaveLength(0);
  });
});
