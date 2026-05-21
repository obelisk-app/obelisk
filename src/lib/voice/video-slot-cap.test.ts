/**
 * Tests for the room-wide video-slot cap.
 *
 * The room allows up to 8 audio participants (`MAX_PARTICIPANTS`) but only
 * `MAX_VIDEO_SLOTS = 4` simultaneous outbound video tracks across the
 * whole room — camera and screen counted in the same pool. The cap is
 * enforced cooperatively: every client computes the global count from the
 * roster's `videoTracks` lists plus its own local state, and refuses /
 * evicts when over.
 *
 * Coverage:
 *   - cold-started client can claim camera up to the cap
 *   - cold-started client refuses camera once the room is at the cap
 *   - mixed cameras + screens count toward the same pool
 *   - race-overflow: a remote claim that landed before ours pushes us out
 *   - leave releases the slot
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installWebRtcMocks, installMediaDevicesMocks, flushMicrotasks } from '@/test/mocks/webrtc';
import type { VoicePresence, VoiceSignalPayload } from './types';

const transportFake = vi.hoisted(() => {
  let rosterCb: ((roster: VoicePresence[]) => void) | null = null;
  let signalsCb: ((from: string, p: VoiceSignalPayload) => void) | null = null;
  let selfPubkey = 'self';
  return {
    publishPresenceBeacon: vi.fn(async () => {}),
    subscribeRoster: vi.fn(async (_id: string, cb: (r: VoicePresence[]) => void) => {
      rosterCb = cb;
      return () => { rosterCb = null; };
    }),
    sendSignal: vi.fn(async () => {}),
    subscribeSignals: vi.fn(async (_id: string, _self: string, cb: (from: string, p: VoiceSignalPayload) => void) => {
      signalsCb = cb;
      return () => { signalsCb = null; };
    }),
    getSelfPubkey: vi.fn(() => selfPubkey),
    setSelfPubkey: (pk: string) => { selfPubkey = pk; },
    fireRoster: (r: VoicePresence[]) => { rosterCb?.(r); },
    fireSignal: (from: string, payload: VoiceSignalPayload) => { signalsCb?.(from, payload); },
    reset: () => {
      rosterCb = null;
      signalsCb = null;
      selfPubkey = 'self';
    },
  };
});

vi.mock('./transport', () => ({
  publishPresenceBeacon: transportFake.publishPresenceBeacon,
  subscribeRoster: transportFake.subscribeRoster,
  sendSignal: transportFake.sendSignal,
  subscribeSignals: transportFake.subscribeSignals,
  createVoiceTransport: vi.fn(() => ({
    publishPresenceBeacon: transportFake.publishPresenceBeacon,
    subscribeRoster: transportFake.subscribeRoster,
    sendSignal: transportFake.sendSignal,
    subscribeSignals: transportFake.subscribeSignals,
  })),
  getSelfPubkey: transportFake.getSelfPubkey,
  transitiveParticipants: (roster: VoicePresence[]) => {
    const set = new Set<string>();
    for (const p of roster) {
      set.add(p.pubkey);
      for (const pk of p.connectedTo) set.add(pk);
      for (const pk of p.knownPeers ?? []) set.add(pk);
    }
    return Array.from(set);
  },
}));

import { VoiceClient } from './client';

const SELF = 'a'.repeat(64);
const PEERS = [
  'b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64), 'e'.repeat(64),
  'f'.repeat(64), '1'.repeat(64), '2'.repeat(64),
];

let webrtc: ReturnType<typeof installWebRtcMocks>;
let media: ReturnType<typeof installMediaDevicesMocks>;

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
  videoTracks: ('camera' | 'screen')[] = [],
  createdAt = 1,
  connectedTo: string[] = [],
): VoicePresence {
  return { pubkey, channelId: 'ch1', createdAt, expiresAt: 9999999999, connectedTo, videoTracks, isSfu: false };
}

describe('VoiceClient.canClaimVideoSlot', () => {
  it('allows the first 4 video starts in an otherwise idle room', async () => {
    const members = [SELF, ...PEERS];
    const client = new VoiceClient('ch1', { members });
    await client.join();
    transportFake.fireRoster([]);
    await flushMicrotasks(8);

    expect(client.getVideoSlotsAvailable()).toBe(4);
    await client.setCameraEnabled(true);
    expect(client.getVideoSlotsAvailable()).toBe(3);

    await client.leave();
  });

  it('refuses a camera start when the room already has 4 video tracks', async () => {
    const members = [SELF, ...PEERS];
    const client = new VoiceClient('ch1', { members });
    await client.join();
    // Four other peers each claim a video slot — two cameras, two screens.
    transportFake.fireRoster([
      presence(PEERS[0], ['camera']),
      presence(PEERS[1], ['camera']),
      presence(PEERS[2], ['screen']),
      presence(PEERS[3], ['screen']),
    ]);
    await flushMicrotasks(8);

    expect(client.getVideoSlotsAvailable()).toBe(0);
    await expect(client.setCameraEnabled(true)).rejects.toThrow(/Video room is full/i);
    await client.leave();
  });

  it('refuses a screen-share start when the room is at the cap', async () => {
    const members = [SELF, ...PEERS];
    const client = new VoiceClient('ch1', { members });
    await client.join();
    transportFake.fireRoster([
      presence(PEERS[0], ['camera']),
      presence(PEERS[1], ['camera']),
      presence(PEERS[2], ['camera']),
      presence(PEERS[3], ['camera']),
    ]);
    await flushMicrotasks(8);

    await expect(client.setScreenShareEnabled(true)).rejects.toThrow(/Video room is full/i);
    await client.leave();
  });

  it('counts a peer with both camera AND screen as 2 slots', async () => {
    const members = [SELF, ...PEERS];
    const client = new VoiceClient('ch1', { members });
    await client.join();
    // PEER0 holds two slots; PEERS 1, 2 each hold one. Total = 4. Self can't claim.
    transportFake.fireRoster([
      presence(PEERS[0], ['camera', 'screen']),
      presence(PEERS[1], ['camera']),
      presence(PEERS[2], ['screen']),
    ]);
    await flushMicrotasks(8);

    expect(client.getVideoSlotsAvailable()).toBe(0);
    await expect(client.setCameraEnabled(true)).rejects.toThrow(/Video room is full/i);
    await client.leave();
  });
});

describe('VoiceClient race resolution (deterministic eviction)', () => {
  it('evicts our local video when a remote peer claimed an earlier slot', async () => {
    const members = [SELF, ...PEERS];
    const client = new VoiceClient('ch1', { members });
    await client.join();
    // 3 remote peers claimed cameras at createdAt=1 (well before us).
    transportFake.fireRoster([
      presence(PEERS[0], ['camera'], 1),
      presence(PEERS[1], ['camera'], 1),
      presence(PEERS[2], ['camera'], 1),
    ]);
    await flushMicrotasks(8);
    // Cap is 4 — one slot left for us, we claim it.
    await client.setCameraEnabled(true);
    expect(client.getLocalTracks().camera).not.toBeNull();

    // Race: a 4th remote peer's beacon arrives; their createdAt=1 (earlier
    // than our local now()). Our (claimedAt=now, pubkey=a) is greater than
    // their (createdAt=1, pubkey=...) → we sort outside the leading slice.
    transportFake.fireRoster([
      presence(PEERS[0], ['camera'], 1),
      presence(PEERS[1], ['camera'], 1),
      presence(PEERS[2], ['camera'], 1),
      presence(PEERS[3], ['camera'], 1),
    ]);
    await flushMicrotasks(8);

    // Our camera should have been evicted by enforceVideoSlotCap.
    expect(client.getLocalTracks().camera).toBeNull();
    await client.leave();
  });

  it('keeps our local video when our claimedAt is older than incoming peer claims', async () => {
    const members = [SELF, ...PEERS];
    const client = new VoiceClient('ch1', { members });
    await client.join();
    transportFake.fireRoster([]);
    await flushMicrotasks(8);
    // We claim camera FIRST (at the test's "now" — ~1.7e9).
    await client.setCameraEnabled(true);

    // Now 4 peers each publish beacons at createdAt = 9_999_999_999 (way
    // in the future, sorts AFTER us). They overflow the cap; we keep our
    // slot, they don't.
    transportFake.fireRoster([
      presence(PEERS[0], ['camera'], 9_999_999_999),
      presence(PEERS[1], ['camera'], 9_999_999_999),
      presence(PEERS[2], ['camera'], 9_999_999_999),
      presence(PEERS[3], ['camera'], 9_999_999_999),
    ]);
    await flushMicrotasks(8);

    // Our camera survives because our claimedAt is older.
    expect(client.getLocalTracks().camera).not.toBeNull();
    await client.leave();
  });
});

describe('VoiceClient slot release on stop', () => {
  it('frees the slot when local camera turns off', async () => {
    const members = [SELF, ...PEERS];
    const client = new VoiceClient('ch1', { members });
    await client.join();
    transportFake.fireRoster([]);
    await flushMicrotasks(8);
    await client.setCameraEnabled(true);
    expect(client.getVideoSlotsAvailable()).toBe(3);
    await client.setCameraEnabled(false);
    expect(client.getVideoSlotsAvailable()).toBe(4);
    await client.leave();
  });

  it('frees both slots when local user has camera + screen and leaves', async () => {
    const members = [SELF, ...PEERS];
    const client = new VoiceClient('ch1', { members });
    await client.join();
    transportFake.fireRoster([]);
    await flushMicrotasks(8);
    await client.setCameraEnabled(true);
    await client.setScreenShareEnabled(true);
    expect(client.getVideoSlotsAvailable()).toBe(2);
    await client.leave();
    // After leave, building the slot list returns 0 — internal state cleared.
    expect(client.getVideoSlotsAvailable()).toBe(4);
  });
});
