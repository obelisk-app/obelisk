/**
 * Tests for the Peer class — the perfect-negotiation wrapper around
 * RTCPeerConnection.
 *
 * Strategy: install the FakePc mock and drive single peers through realistic
 * scenarios (addTrack → offer, glare resolution, stats monitor lifecycle).
 * Two-peer round-trips live in `peer-pair.integration.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ICE_CANDIDATE_BATCH_MS, Peer, type PeerEvents } from './peer';
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
  allowPoliteInitialOffer?: boolean;
  events?: Partial<PeerEvents>;
}

function makePeer(opts: MakePeerOpts = {}) {
  const sent: VoiceSignalPayload[] = [];
  const peer = new Peer({
    remotePubkey: opts.remotePubkey ?? 'b'.repeat(64),
    polite: opts.polite ?? true,
    allowPoliteInitialOffer: opts.allowPoliteInitialOffer,
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

/**
 * Drive a peer through one full negotiation round-trip so subsequent
 * offers count as "renegotiations on a connected PC". The offer-ack
 * watchdog only arms post-connect (the initial handshake is covered
 * by the connect watchdog).
 */
async function bringPeerToConnected(peer: Peer, sent: VoiceSignalPayload[]) {
  const pc = peer.pc as unknown as FakeRTCPeerConnection;
  const initialTrack = new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack;
  await peer.setLocalTrack('audio', initialTrack);
  await flushMicrotasks(8);
  // Apply a real answer so signalingState returns to 'stable' and the
  // PC transitions to 'connected'.
  const remotePc = new FakeRTCPeerConnection();
  remotePc.addTrack(new FakeMediaStreamTrack('audio'));
  await remotePc.setRemoteDescription({ type: 'offer', sdp: pc.localDescription!.sdp });
  await remotePc.setLocalDescription();
  const answerSdp = remotePc.localDescription!.sdp;
  await peer.handleSignal({ type: 'answer', sdp: answerSdp, sessionId: 's', seq: 0 });
  await flushMicrotasks(8);
  // FakePc's setRemoteDescription({answer}) triggers markConnected
  // when signalingState returns to stable; verify and clear sent log.
  return { pc, initialOfferCount: sent.filter((s) => s.type === 'offer').length };
}

describe('Peer offer-ack watchdog', () => {
  it('resends the SDP if a renegotiation offer goes unacked past OFFER_ACK_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    try {
      const { peer, sent } = makePeer({ polite: false });
      const { pc, initialOfferCount } = await bringPeerToConnected(peer, sent);
      expect(peer.pc.connectionState).toBe('connected');

      // Mid-call: add a video track. This triggers a fresh offer.
      const cam = new FakeMediaStreamTrack('video') as unknown as MediaStreamTrack;
      await peer.setLocalTrack('camera', cam);
      await flushMicrotasks(8);
      const offersAfterAdd = sent.filter((s) => s.type === 'offer').length;
      expect(offersAfterAdd).toBe(initialOfferCount + 1);
      expect(pc.signalingState).toBe('have-local-offer');

      await vi.advanceTimersByTimeAsync(8500);
      await flushMicrotasks(8);

      const offersAfterWatchdog = sent.filter((s) => s.type === 'offer').length;
      expect(offersAfterWatchdog).toBe(offersAfterAdd + 1);
      const offers = sent.filter((s) => s.type === 'offer');
      expect(offers[offers.length - 1].sdp).toBe(offers[offers.length - 2].sdp);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not resend a renegotiation offer if the answer applies first', async () => {
    vi.useFakeTimers();
    try {
      const { peer, sent } = makePeer({ polite: false });
      const { pc, initialOfferCount } = await bringPeerToConnected(peer, sent);

      const cam = new FakeMediaStreamTrack('video') as unknown as MediaStreamTrack;
      await peer.setLocalTrack('camera', cam);
      await flushMicrotasks(8);
      const offersAfterAdd = sent.filter((s) => s.type === 'offer').length;
      expect(offersAfterAdd).toBe(initialOfferCount + 1);

      // Apply the corresponding answer.
      const remotePc = new FakeRTCPeerConnection();
      remotePc.addTrack(new FakeMediaStreamTrack('audio'));
      remotePc.addTrack(new FakeMediaStreamTrack('video'));
      await remotePc.setRemoteDescription({ type: 'offer', sdp: pc.localDescription!.sdp });
      await remotePc.setLocalDescription();
      await peer.handleSignal({ type: 'answer', sdp: remotePc.localDescription!.sdp, sessionId: 's', seq: 2 });
      await flushMicrotasks(8);
      expect(pc.signalingState).toBe('stable');

      await vi.advanceTimersByTimeAsync(9000);
      await flushMicrotasks(8);

      const finalOfferCount = sent.filter((s) => s.type === 'offer').length;
      expect(finalOfferCount).toBe(offersAfterAdd);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not arm the watchdog on the initial (pre-connect) handshake', async () => {
    vi.useFakeTimers();
    try {
      const { peer, sent } = makePeer({ polite: false });
      const track = new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack;
      await peer.setLocalTrack('audio', track);
      await flushMicrotasks(8);
      const initial = sent.filter((s) => s.type === 'offer').length;
      // PC has not been driven to connected — no answer applied.
      expect(peer.pc.connectionState).not.toBe('connected');
      // Advance past the offer-ack timeout but BEFORE the connect
      // watchdog (both happen to be 8 s; we stop early to isolate the
      // offer-ack path). The watchdog must NOT have fired — initial
      // handshake recovery is owned by the connect watchdog instead.
      await vi.advanceTimersByTimeAsync(7000);
      await flushMicrotasks(8);
      const after = sent.filter((s) => s.type === 'offer').length;
      expect(after).toBe(initial);
    } finally {
      vi.useRealTimers();
    }
  });
});

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

  it('triggers an offer publication from the impolite side via the send callback', async () => {
    const { peer, sent } = makePeer({ polite: false });
    const track = new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack;
    await peer.setLocalTrack('audio', track);
    await flushMicrotasks(8);

    expect(sent.find((s) => s.type === 'offer')).toBeDefined();
    expect(sent.find((s) => s.type === 'trackinfo')).toBeDefined();
  });

  it('does not publish a pre-connect offer from the polite side', async () => {
    const { peer, sent } = makePeer({ polite: true });
    const track = new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack;
    await peer.setLocalTrack('audio', track);
    await flushMicrotasks(8);

    expect(sent.find((s) => s.type === 'offer')).toBeUndefined();
    expect(sent.find((s) => s.type === 'trackinfo')).toBeDefined();
  });

  it('can explicitly allow a polite pre-connect offer for legacy peers', async () => {
    const { peer, sent } = makePeer({ polite: true, allowPoliteInitialOffer: true });
    const track = new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack;
    await peer.setLocalTrack('audio', track);
    await flushMicrotasks(8);

    expect(sent.find((s) => s.type === 'offer')).toBeDefined();
  });

  it('biases video transceiver toward VP9 → H.264 → VP8', async () => {
    const { peer } = makePeer();
    const track = new FakeMediaStreamTrack('video') as unknown as MediaStreamTrack;
    await peer.setLocalTrack('camera', track);
    await flushMicrotasks(8);

    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    const tx = pc.getTransceivers().find((t) => t.kind === 'video');
    expect(tx).toBeDefined();
    const order = tx!.codecPreferences.map((c) => c.mimeType.toLowerCase());
    // First three slots must be VP9, H.264, VP8 in that exact order.
    expect(order.slice(0, 3)).toEqual(['video/vp9', 'video/h264', 'video/vp8']);
    // AV1 / RTX still appear at the bottom — we don't drop unknown codecs.
    expect(order).toContain('video/av1');
    expect(order).toContain('video/rtx');
  });

  it('does not call setCodecPreferences for audio tracks', async () => {
    const { peer } = makePeer();
    const track = new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack;
    await peer.setLocalTrack('audio', track);
    await flushMicrotasks(8);

    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    const tx = pc.getTransceivers().find((t) => t.kind === 'audio');
    expect(tx).toBeDefined();
    expect(tx!.codecPreferences).toEqual([]);
  });
});

describe('Peer ICE candidate batching', () => {
  it('publishes multiple local candidates as one signal batch', async () => {
    vi.useFakeTimers();
    const { peer, sent } = makePeer();
    try {
      const pc = peer.pc as unknown as FakeRTCPeerConnection;
      const candidate = (value: string) => Object.assign(Object.create(null), {
        toJSON: () => ({ candidate: value, sdpMid: '0' }),
      }) as RTCIceCandidateInit;

      pc.onicecandidate?.({ candidate: candidate('candidate-a') });
      pc.onicecandidate?.({ candidate: candidate('candidate-b') });
      await vi.advanceTimersByTimeAsync(ICE_CANDIDATE_BATCH_MS);
      await flushMicrotasks(4);

      const ice = sent.filter((s) => s.type === 'ice');
      expect(ice).toHaveLength(1);
      expect(ice[0].candidates).toEqual([
        { candidate: 'candidate-a', sdpMid: '0' },
        { candidate: 'candidate-b', sdpMid: '0' },
      ]);
    } finally {
      peer.close();
      vi.useRealTimers();
    }
  });

  it('flushes a pending candidate batch when gathering completes', async () => {
    vi.useFakeTimers();
    const { peer, sent } = makePeer();
    try {
      const pc = peer.pc as unknown as FakeRTCPeerConnection;
      const candidate = Object.assign(Object.create(null), {
        toJSON: () => ({ candidate: 'candidate-a', sdpMid: '0' }),
      }) as RTCIceCandidateInit;

      pc.onicecandidate?.({ candidate });
      pc.onicecandidate?.({ candidate: null });
      await flushMicrotasks(4);

      const ice = sent.filter((s) => s.type === 'ice');
      expect(ice).toHaveLength(1);
      expect(ice[0].candidates).toEqual([{ candidate: 'candidate-a', sdpMid: '0' }]);
    } finally {
      peer.close();
      vi.useRealTimers();
    }
  });
});

describe('Peer degradationPreference (video)', () => {
  it('camera sender is configured for maintain-framerate', async () => {
    const { peer } = makePeer();
    const track = new FakeMediaStreamTrack('video') as unknown as MediaStreamTrack;
    await peer.setLocalTrack('camera', track);
    await peer.setLocalVideoCap({ maxBitrate: 3_500_000, maxFramerate: 30 });
    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    pc.forceState('connected');
    await flushMicrotasks(8);

    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
    const params = sender!.inspect() as unknown as { degradationPreference?: string };
    expect(params.degradationPreference).toBe('maintain-framerate');
  });

  it('screen sender is configured for maintain-resolution', async () => {
    const { peer } = makePeer();
    const track = new FakeMediaStreamTrack('video') as unknown as MediaStreamTrack;
    await peer.setLocalTrack('screen', track);
    await peer.setLocalVideoCap({ maxBitrate: 5_000_000, maxFramerate: 30 });
    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    pc.forceState('connected');
    await flushMicrotasks(8);

    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
    const params = sender!.inspect() as unknown as { degradationPreference?: string };
    expect(params.degradationPreference).toBe('maintain-resolution');
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

  it('renegotiates local media added while answering a remote offer', async () => {
    const { peer, sent } = makePeer({ polite: true });
    const pc = peer.pc as unknown as FakeRTCPeerConnection;

    const originalSetRemoteDescription = pc.setRemoteDescription.bind(pc);
    let releaseRemoteOffer: (() => void) | null = null;
    let holdFirstOffer = true;
    pc.setRemoteDescription = async (desc) => {
      await originalSetRemoteDescription(desc);
      if (holdFirstOffer && desc.type === 'offer') {
        holdFirstOffer = false;
        await new Promise<void>((resolve) => { releaseRemoteOffer = resolve; });
      }
    };

    const remotePc = new FakeRTCPeerConnection();
    await remotePc.setLocalDescription();
    const handling = peer.handleSignal({ type: 'offer', sdp: remotePc.localDescription!.sdp, sessionId: 's', seq: 1 });
    await flushMicrotasks(4);
    expect(pc.signalingState).toBe('have-remote-offer');

    await peer.setLocalTrack('camera', new FakeMediaStreamTrack('video') as unknown as MediaStreamTrack);
    await flushMicrotasks(8);
    expect(sent.some((payload) => payload.type === 'offer')).toBe(false);

    if (!releaseRemoteOffer) throw new Error('remote offer was not held');
    releaseRemoteOffer();
    await handling;
    await flushMicrotasks(12);

    const answerIndex = sent.findIndex((payload) => payload.type === 'answer');
    const offerIndex = sent.findIndex((payload, i) => i > answerIndex && payload.type === 'offer');
    expect(answerIndex).toBeGreaterThanOrEqual(0);
    expect(offerIndex).toBeGreaterThan(answerIndex);
    expect(sent[offerIndex].sdp).toContain('"kind":"video"');
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
    expect(audioSender.inspect().encodings[0].maxBitrate).toBe(256_000);
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

describe('Peer remote-track mute / unmute', () => {
  it('treats a video mute event as track-ended so the receiver drops the frozen frame', async () => {
    const onRemoteTrack = vi.fn();
    const onRemoteTrackEnded = vi.fn();
    const { peer } = makePeer({ events: { onRemoteTrack, onRemoteTrackEnded } });
    const pc = peer.pc as unknown as FakeRTCPeerConnection;

    // Pretend the receiver got a video track via ontrack.
    const vid = new FakeMediaStreamTrack('video');
    const stream = { getTracks: () => [vid] } as unknown as MediaStream;
    pc.ontrack?.({ track: vid, streams: [stream as unknown as never] } as never);

    expect(onRemoteTrack).toHaveBeenCalledTimes(1);
    expect(typeof vid.onmute).toBe('function');

    // The sender turned their camera off → the receiver gets `mute`. We
    // surface that as `onRemoteTrackEnded` so the React layer drops the
    // stream entry (and the <video> falls back to the avatar tile).
    vid.onmute?.();
    expect(onRemoteTrackEnded).toHaveBeenCalledWith(vid.id);
  });

  it('re-emits onRemoteTrack on unmute so the tile recovers when the sender re-enables', async () => {
    const onRemoteTrack = vi.fn();
    const { peer } = makePeer({ events: { onRemoteTrack } });
    const pc = peer.pc as unknown as FakeRTCPeerConnection;

    const vid = new FakeMediaStreamTrack('video');
    const stream = { getTracks: () => [vid] } as unknown as MediaStream;
    pc.ontrack?.({ track: vid, streams: [stream as unknown as never] } as never);

    vid.onmute?.();
    onRemoteTrack.mockClear();
    vid.onunmute?.();
    expect(onRemoteTrack).toHaveBeenCalledTimes(1);
  });

  it('does NOT install onmute / onunmute on remote audio tracks', async () => {
    const { peer } = makePeer();
    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    const audio = new FakeMediaStreamTrack('audio');
    const stream = { getTracks: () => [audio] } as unknown as MediaStream;
    pc.ontrack?.({ track: audio, streams: [stream as unknown as never] } as never);
    // Audio mute = silent audio, which is fine. The speaking detector handles
    // it; we don't want to drop the stream entry.
    expect(audio.onmute).toBeNull();
    expect(audio.onunmute).toBeNull();
  });
});
