/**
 * Tests for VoiceClient — the per-channel orchestrator.
 *
 * The transport layer (`./transport`) is mocked so tests drive roster +
 * signaling synchronously. WebRTC and getUserMedia are mocked too. This
 * leaves us to test the actual orchestration: roster→peer creation,
 * member filtering, mic/cam toggles, quality propagation, capacity cap.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installWebRtcMocks, installMediaDevicesMocks, flushMicrotasks, FakeRTCPeerConnection } from '@/test/mocks/webrtc';
import type { VoicePresence, VoiceSignalPayload } from './types';

// ── transport mock ──────────────────────────────────────────────────────
const transportFake = vi.hoisted(() => {
  let rosterCb: ((roster: VoicePresence[]) => void) | null = null;
  let signalsCb: ((from: string, p: VoiceSignalPayload) => void) | null = null;
  const sentSignals: { to: string; payload: VoiceSignalPayload }[] = [];
  let selfPubkey = 'self';
  return {
    publishPresenceBeacon: vi.fn(async () => {}),
    subscribeRoster: vi.fn(async (_id: string, cb: (r: VoicePresence[]) => void) => {
      rosterCb = cb;
      return () => { rosterCb = null; };
    }),
    sendSignal: vi.fn(async (_id: string, to: string, payload: VoiceSignalPayload) => {
      sentSignals.push({ to, payload });
    }),
    subscribeSignals: vi.fn(async (_id: string, _self: string, cb: (from: string, p: VoiceSignalPayload) => void) => {
      signalsCb = cb;
      return () => { signalsCb = null; };
    }),
    getSelfPubkey: vi.fn(() => selfPubkey),
    setSelfPubkey: (pk: string) => { selfPubkey = pk; },
    fireRoster: (r: VoicePresence[]) => { rosterCb?.(r); },
    fireSignal: (from: string, payload: VoiceSignalPayload) => { signalsCb?.(from, payload); },
    sentSignals,
    reset: () => {
      rosterCb = null;
      signalsCb = null;
      sentSignals.length = 0;
      selfPubkey = 'self';
    },
  };
});

vi.mock('./transport', () => ({
  publishPresenceBeacon: transportFake.publishPresenceBeacon,
  subscribeRoster: transportFake.subscribeRoster,
  sendSignal: transportFake.sendSignal,
  subscribeSignals: transportFake.subscribeSignals,
  getSelfPubkey: transportFake.getSelfPubkey,
  // Pure function — pass through unchanged for tests. Roster types now
  // carry `videoTracks` too; the transitive computation only unions
  // pubkeys, so the body stays the same.
  transitiveParticipants: (roster: VoicePresence[]) => {
    const set = new Set<string>();
    for (const p of roster) {
      set.add(p.pubkey);
      for (const pk of p.connectedTo) set.add(pk);
    }
    return Array.from(set);
  },
}));

// Import VoiceClient after mocks.
import { VoiceClient } from './client';

let webrtc: ReturnType<typeof installWebRtcMocks>;
let media: ReturnType<typeof installMediaDevicesMocks>;

const SELF = 'a'.repeat(64);
const PEER1 = 'b'.repeat(64);
const PEER2 = 'c'.repeat(64);

beforeEach(() => {
  webrtc = installWebRtcMocks();
  media = installMediaDevicesMocks();
  transportFake.reset();
  transportFake.setSelfPubkey(SELF);
});

afterEach(() => {
  webrtc.uninstall();
  media.uninstall();
  vi.clearAllMocks();
});

function presence(
  pubkey: string,
  connectedTo: string[] = [],
  videoTracks: ('camera' | 'screen')[] = [],
): VoicePresence {
  return { pubkey, channelId: 'ch1', createdAt: 1, expiresAt: 9999999999, connectedTo, videoTracks };
}

describe('VoiceClient.join', () => {
  it('throws when the local user is not in the member list', async () => {
    const client = new VoiceClient('ch1', { members: [PEER1] });
    await expect(client.join()).rejects.toThrow(/not a member/i);
  });

  it('joins, publishes a beacon, and subscribes to roster + signals', async () => {
    const client = new VoiceClient('ch1', { members: [SELF] });
    await client.join();
    // Beacon now carries the publisher's connected-peer list AND the
    // active video tracks (both empty on first beacon — no peers yet, no
    // video).
    expect(transportFake.publishPresenceBeacon).toHaveBeenCalledWith('ch1', [], []);
    expect(transportFake.subscribeRoster).toHaveBeenCalled();
    expect(transportFake.subscribeSignals).toHaveBeenCalled();
    await client.leave();
  });

  it('treats an empty member list as an open room', async () => {
    const client = new VoiceClient('ch1');
    await client.join();
    expect(client.canJoin()).toBe(true);
    await client.leave();
  });
});

describe('VoiceClient roster → peer lifecycle', () => {
  it('creates a peer for each member in the roster (excluding self)', async () => {
    const client = new VoiceClient('ch1', { members: [SELF, PEER1, PEER2] });
    await client.join();
    transportFake.fireRoster([presence(SELF), presence(PEER1), presence(PEER2)]);
    await flushMicrotasks(8);

    expect(client.getParticipants().sort()).toEqual([PEER1, PEER2].sort());
    await client.leave();
  });

  it('filters non-members out of the roster', async () => {
    const client = new VoiceClient('ch1', { members: [SELF, PEER1] });
    await client.join();
    transportFake.fireRoster([presence(PEER1), presence(PEER2)]);
    await flushMicrotasks(8);
    expect(client.getParticipants()).toEqual([PEER1]);
    await client.leave();
  });

  it('updateRoles tears down peers that just left the member set', async () => {
    const client = new VoiceClient('ch1', { members: [SELF, PEER1, PEER2] });
    await client.join();
    transportFake.fireRoster([presence(PEER1), presence(PEER2)]);
    await flushMicrotasks(8);
    expect(client.getParticipants().sort()).toEqual([PEER1, PEER2].sort());

    client.updateRoles([SELF, PEER1], []);
    await flushMicrotasks(8);
    // PEER2 should be torn down.
    const remaining = client.getRemoteTracks().map((t) => t.pubkey);
    expect(remaining).not.toContain(PEER2);
    await client.leave();
  });

  it('drops signals from non-members', async () => {
    const client = new VoiceClient('ch1', { members: [SELF, PEER1] });
    await client.join();
    transportFake.fireSignal(PEER2, { type: 'offer', sdp: 'v=0\r\n', sessionId: 's', seq: 1 });
    await flushMicrotasks(4);
    // No peer was created for PEER2.
    expect(webrtc.pcs()).toHaveLength(0);
    await client.leave();
  });
});

describe('VoiceClient mic/cam/screen toggles', () => {
  it('setMicEnabled(true) acquires a mic stream and pushes it to peers', async () => {
    const client = new VoiceClient('ch1', { members: [SELF, PEER1] });
    await client.join();
    transportFake.fireRoster([presence(PEER1)]);
    await flushMicrotasks(8);
    // join() already enables mic; toggle off then on to exercise both paths.
    await client.setMicEnabled(false);
    await client.setMicEnabled(true);
    await flushMicrotasks(8);

    const pc = webrtc.last();
    const audioSenders = pc.getSenders().filter((s) => s.track?.kind === 'audio');
    expect(audioSenders.length).toBeGreaterThanOrEqual(1);
    await client.leave();
  });

  it('setCameraEnabled(true) uses the current videoQuality preset', async () => {
    const { useVoiceStore } = await import('@/store/voice');
    useVoiceStore.getState().setVideoQuality('480p');

    const client = new VoiceClient('ch1', { members: [SELF, PEER1] });
    await client.join();
    transportFake.fireRoster([presence(PEER1)]);
    await flushMicrotasks(8);

    await client.setCameraEnabled(true);
    await flushMicrotasks(8);

    const pc = webrtc.last();
    const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
    expect(videoSender).toBeDefined();
    // After connect, the encoder cap is applied.
    pc.forceState('connected');
    await flushMicrotasks(8);
    // Cap reflects 480p preset (1.5 Mbps post-bump).
    expect(videoSender?.inspect().encodings[0].maxBitrate).toBe(1_500_000);

    await client.leave();
    useVoiceStore.getState().setVideoQuality('auto');
  });

  it('setScreenShareEnabled cleans up when the browser ends the share', async () => {
    const client = new VoiceClient('ch1', { members: [SELF, PEER1] });
    await client.join();
    transportFake.fireRoster([presence(PEER1)]);
    await flushMicrotasks(8);

    await client.setScreenShareEnabled(true);
    await flushMicrotasks(8);
    // Simulate user clicking "Stop sharing" in browser.
    const pc = webrtc.last();
    const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
    const track = videoSender?.track as { onended?: () => void; stop: () => void } | null | undefined;
    track?.onended?.();
    await flushMicrotasks(8);
    expect(client.getLocalTracks().screen).toBeNull();
    await client.leave();
  });

  it('setDeafenEnabled disables receive audio without affecting publish', async () => {
    const client = new VoiceClient('ch1', { members: [SELF, PEER1] });
    await client.join();
    transportFake.fireRoster([presence(PEER1)]);
    await flushMicrotasks(20);
    // Drive a remote audio track in via a remote offer.
    // Easiest: mark the existing remote PC as receiving on its current m-line.
    client.setDeafenEnabled(true);
    expect(client.isDeafened()).toBe(true);
    // Local mic state is independent.
    expect(client.getLocalTracks().mic).not.toBeNull();
    await client.leave();
  });
});

describe('VoiceClient quality propagation', () => {
  it('applyVideoQuality re-runs applyConstraints on the camera track', async () => {
    const client = new VoiceClient('ch1', { members: [SELF, PEER1] });
    await client.join();
    transportFake.fireRoster([presence(PEER1)]);
    await flushMicrotasks(8);
    await client.setCameraEnabled(true);
    await flushMicrotasks(8);

    await client.applyVideoQuality('720p');
    const cam = client.getLocalTracks().camera as unknown as { appliedConstraints: MediaTrackConstraints };
    // Most recent applyConstraints corresponds to 720p.
    expect((cam.appliedConstraints.height as { ideal: number }).ideal).toBe(720);
    await client.leave();
  });

  it('broadcastReceivedQuality sends a qualityhint to every peer', async () => {
    const client = new VoiceClient('ch1', { members: [SELF, PEER1, PEER2] });
    await client.join();
    transportFake.fireRoster([presence(PEER1), presence(PEER2)]);
    await flushMicrotasks(20);

    transportFake.sentSignals.length = 0;
    await client.broadcastReceivedQuality('480p');
    const hints = transportFake.sentSignals.filter((s) => s.payload.type === 'qualityhint');
    expect(new Set(hints.map((h) => h.to))).toEqual(new Set([PEER1, PEER2]));
    expect(hints[0].payload.qualityHint?.maxHeight).toBe(480);
    await client.leave();
  });
});

describe('VoiceClient capacity cap', () => {
  it('caps audio mesh participants at 8', async () => {
    // 10 candidates; 8-person audio cap + self trims to <= 7 others.
    const members = [
      SELF, PEER1, PEER2,
      'd'.repeat(64), 'e'.repeat(64), 'f'.repeat(64),
      '1'.repeat(64), '2'.repeat(64),
      '3'.repeat(64), '4'.repeat(64),
    ];
    const client = new VoiceClient('ch1', { members });
    await client.join();
    transportFake.fireRoster(members.map((m) => presence(m)));
    await flushMicrotasks(20);
    // Self + at most 7 others = 8 total.
    expect(client.getParticipants().length).toBeLessThanOrEqual(7);
    await client.leave();
  });
});
