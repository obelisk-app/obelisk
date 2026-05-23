/**
 * Tests for the Peer reconnect ladder.
 *
 * Coverage:
 *  - Initial-handshake watchdog: impolite hard-resets, polite emits requestReset.
 *  - Steady-state recovery: ICE restart up to ICE_RESTART_LIMIT, then hard reset.
 *  - Polite recovery: requestReset signals at POLITE_RESET_DELAYS_MS schedule.
 *  - Hard reset re-attaches local senders so audio doesn't drop after rebuild.
 *  - `requestReset` from a polite peer triggers the impolite peer's hard reset.
 *  - onConnectionEstablished / onConnectionLost edges fire exactly once per
 *    connect/disconnect transition.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Peer,
  RECONNECT_DELAYS_MS,
  POLITE_RESET_DELAYS_MS,
  ICE_RESTART_LIMIT,
  INITIAL_CONNECT_TIMEOUT_MS,
  type PeerEvents,
} from './peer';
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
  vi.useFakeTimers();
});
afterEach(() => {
  webrtc.uninstall();
  vi.useRealTimers();
});

interface MakeOpts {
  polite?: boolean;
  iceTransportPolicy?: RTCIceTransportPolicy;
  events?: Partial<PeerEvents>;
}

function makePeer(opts: MakeOpts = {}) {
  const sent: VoiceSignalPayload[] = [];
  const peer = new Peer({
    remotePubkey: 'b'.repeat(64),
    polite: opts.polite ?? false,
    iceTransportPolicy: opts.iceTransportPolicy,
    sessionId: 'sess-1',
    send: async (p) => { sent.push(p); },
    events: {
      onRemoteTrack: vi.fn(),
      onRemoteTrackEnded: vi.fn(),
      onConnectionStateChange: vi.fn(),
      ...(opts.events ?? {}),
    },
  });
  return { peer, sent };
}

async function settle() {
  await flushMicrotasks(8);
}

describe('Peer initial-connect watchdog', () => {
  it('impolite peer hard-resets when handshake never reaches connected', async () => {
    const { peer } = makePeer({ polite: false });
    const firstPc = peer.pc as unknown as FakeRTCPeerConnection;
    // Stay in 'new' / 'connecting' — no progression.
    vi.advanceTimersByTime(INITIAL_CONNECT_TIMEOUT_MS + 10);
    await settle();
    // Hard reset closes the original PC and replaces peer.pc with a fresh one.
    expect(firstPc.connectionState).toBe('closed');
    expect(peer.pc).not.toBe(firstPc);
  });

  it('polite peer publishes requestReset on watchdog timeout', async () => {
    const { peer, sent } = makePeer({ polite: true });
    const firstPc = peer.pc as unknown as FakeRTCPeerConnection;
    vi.advanceTimersByTime(INITIAL_CONNECT_TIMEOUT_MS + 10);
    await settle();
    // Polite side does NOT recreate its own PC — it asks the impolite side to.
    expect(sent.some((s) => s.type === 'requestReset')).toBe(true);
    expect(firstPc.connectionState).not.toBe('closed');
    expect(peer.pc).toBe(firstPc);
  });

  it('relaxes relay-only ICE to all after an initial failed connection', async () => {
    const { peer } = makePeer({ polite: false, iceTransportPolicy: 'relay' });
    const firstPc = peer.pc as unknown as FakeRTCPeerConnection;
    expect(firstPc.config?.iceTransportPolicy).toBe('relay');

    firstPc.forceState('failed');
    await settle();

    const fallbackPc = peer.pc as unknown as FakeRTCPeerConnection;
    expect(firstPc.connectionState).toBe('closed');
    expect(fallbackPc).not.toBe(firstPc);
    expect(fallbackPc.config?.iceTransportPolicy).toBe('all');
  });

  it('does nothing if the peer reaches connected before the watchdog fires', async () => {
    const onEstablished = vi.fn();
    const { peer } = makePeer({ polite: false, events: { onConnectionEstablished: onEstablished } });
    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    pc.forceState('connected');
    await settle();
    vi.advanceTimersByTime(INITIAL_CONNECT_TIMEOUT_MS + 10);
    await settle();
    // PC was never closed/replaced.
    expect(peer.pc).toBe(pc);
    expect(pc.connectionState).toBe('connected');
    expect(onEstablished).toHaveBeenCalledTimes(1);
  });
});

describe('Peer steady-state recovery (impolite)', () => {
  it('runs ICE restart up to the limit, then escalates to hard reset', async () => {
    const { peer } = makePeer({ polite: false });
    const initialPc = peer.pc as unknown as FakeRTCPeerConnection;
    initialPc.forceState('connected');
    await settle();

    // Drop to failed → first scheduled attempt is an ICE restart.
    initialPc.forceState('failed');
    await settle();
    vi.advanceTimersByTime(RECONNECT_DELAYS_MS[0]);
    await settle();
    expect(initialPc.restartIceCalls).toBe(1);

    // Force failed again → second ICE restart.
    initialPc.forceState('failed');
    await settle();
    vi.advanceTimersByTime(RECONNECT_DELAYS_MS[1]);
    await settle();
    expect(initialPc.restartIceCalls).toBe(2);

    initialPc.forceState('failed');
    await settle();
    vi.advanceTimersByTime(RECONNECT_DELAYS_MS[2]);
    await settle();
    expect(initialPc.restartIceCalls).toBe(ICE_RESTART_LIMIT);

    // After ICE_RESTART_LIMIT, the next attempt should hard-reset.
    initialPc.forceState('failed');
    await settle();
    vi.advanceTimersByTime(RECONNECT_DELAYS_MS[3]);
    await settle();
    expect(initialPc.connectionState).toBe('closed');
    expect(peer.pc).not.toBe(initialPc);
  });

  it('hard reset re-attaches every previously-set local track', async () => {
    const { peer, sent } = makePeer({ polite: false });
    const audio = new FakeMediaStreamTrack('audio') as unknown as MediaStreamTrack;
    const cam = new FakeMediaStreamTrack('video') as unknown as MediaStreamTrack;
    await peer.setLocalTrack('audio', audio);
    await peer.setLocalTrack('camera', cam);
    await settle();

    const initialPc = peer.pc as unknown as FakeRTCPeerConnection;
    initialPc.forceState('connected');
    await settle();
    sent.length = 0; // forget initial offers/trackinfos.

    initialPc.forceState('failed');
    await settle();
    // Burn through ICE restarts until hard reset triggers.
    for (let i = 0; i <= ICE_RESTART_LIMIT; i++) {
      vi.advanceTimersByTime(RECONNECT_DELAYS_MS[Math.min(i, RECONNECT_DELAYS_MS.length - 1)]);
      await settle();
      if (i < ICE_RESTART_LIMIT) initialPc.forceState('failed');
    }

    const newPc = peer.pc as unknown as FakeRTCPeerConnection;
    expect(newPc).not.toBe(initialPc);
    // Both audio + camera senders re-added on the rebuilt PC.
    expect(newPc.getSenders().length).toBeGreaterThanOrEqual(2);
    // trackinfo announcements re-published for the receiver to re-slot.
    const trackinfoKinds = sent
      .filter((s) => s.type === 'trackinfo')
      .map((s) => s.trackInfo!.kind)
      .sort();
    expect(trackinfoKinds).toContain('audio');
    expect(trackinfoKinds).toContain('camera');
  });
});

describe('Peer steady-state recovery (polite)', () => {
  it('publishes requestReset on the polite-side schedule rather than driving offers', async () => {
    const { peer, sent } = makePeer({ polite: true });
    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    pc.forceState('connected');
    await settle();

    pc.forceState('failed');
    await settle();
    vi.advanceTimersByTime(POLITE_RESET_DELAYS_MS[0]);
    await settle();

    expect(sent.some((s) => s.type === 'requestReset')).toBe(true);
    // Polite side never restarts its own ICE — recovery is the impolite peer's job.
    expect(pc.restartIceCalls).toBe(0);
    // PC instance unchanged (no hard reset on polite side).
    expect(peer.pc).toBe(pc);
  });
});

describe('Peer requestReset handling', () => {
  it('impolite peer hard-resets on receiving requestReset', async () => {
    const { peer } = makePeer({ polite: false });
    const initialPc = peer.pc as unknown as FakeRTCPeerConnection;
    initialPc.forceState('connected');
    await settle();

    await peer.handleSignal({ type: 'requestReset', sessionId: 's', seq: 99 });
    await settle();
    expect(initialPc.connectionState).toBe('closed');
    expect(peer.pc).not.toBe(initialPc);
  });

  it('polite peer ignores requestReset (would loop with the other side)', async () => {
    const { peer } = makePeer({ polite: true });
    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    pc.forceState('connected');
    await settle();

    await peer.handleSignal({ type: 'requestReset', sessionId: 's', seq: 99 });
    await settle();
    expect(pc.connectionState).toBe('connected');
    expect(peer.pc).toBe(pc);
  });
});

describe('Peer hard-reset isolation', () => {
  it('does NOT bubble the old PC\'s close upward — the owner should keep the Peer alive', async () => {
    const onState = vi.fn();
    const { peer } = makePeer({ polite: false, events: { onConnectionStateChange: onState } });
    const initialPc = peer.pc as unknown as FakeRTCPeerConnection;
    initialPc.forceState('connected');
    await settle();
    onState.mockClear();

    // Drive the ladder all the way to a hard reset.
    initialPc.forceState('failed');
    await settle();
    for (let i = 0; i <= ICE_RESTART_LIMIT; i++) {
      vi.advanceTimersByTime(RECONNECT_DELAYS_MS[Math.min(i, RECONNECT_DELAYS_MS.length - 1)]);
      await settle();
      if (i < ICE_RESTART_LIMIT) initialPc.forceState('failed');
    }

    // The new PC is in place.
    expect(peer.pc).not.toBe(initialPc);
    // And the parent never saw a `closed` event from the silent teardown of
    // the old PC — that's the regression: surfacing 'closed' here would
    // make VoiceClient tear the Peer down and orphan the fresh PC.
    expect(onState.mock.calls.find((c) => c[0] === 'closed')).toBeUndefined();
  });
});

describe('Peer connection-edge events', () => {
  it('fires onConnectionEstablished once per transition into connected', async () => {
    const onEstablished = vi.fn();
    const onLost = vi.fn();
    const { peer } = makePeer({ polite: false, events: { onConnectionEstablished: onEstablished, onConnectionLost: onLost } });
    const pc = peer.pc as unknown as FakeRTCPeerConnection;

    pc.forceState('connected');
    await settle();
    pc.forceState('connected');
    await settle();
    expect(onEstablished).toHaveBeenCalledTimes(1);
    expect(onLost).not.toHaveBeenCalled();

    pc.forceState('failed');
    await settle();
    expect(onLost).toHaveBeenCalledTimes(1);

    pc.forceState('connected');
    await settle();
    expect(onEstablished).toHaveBeenCalledTimes(2);
  });

  it('fires onConnectionLost on close()', async () => {
    const onLost = vi.fn();
    const { peer } = makePeer({ polite: false, events: { onConnectionLost: onLost } });
    const pc = peer.pc as unknown as FakeRTCPeerConnection;
    pc.forceState('connected');
    await settle();
    peer.close();
    expect(onLost).toHaveBeenCalledTimes(1);
  });
});
