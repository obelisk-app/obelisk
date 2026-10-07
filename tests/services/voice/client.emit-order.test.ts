/**
 * The order in which VoiceClient talks to its owner and to the UI sink.
 *
 * Every store update a consumer can see (`VoiceClientEvents`, `VoiceUiSink`,
 * `subscribeRemoteTracks` listeners) is appended to one log, in call order,
 * through two scripted calls: a mesh call with one peer, and an SFU call
 * that the SFU closes. The inline snapshots were written by vitest against
 * the client before `RoomState`, `LocalMedia`, `SfuSession` and the
 * active-call watcher took the fields over, so a refactor that reorders an
 * emit (a roster that lands after the tracks that reference it, a local
 * mirror that updates before the owner hears) fails here even though no
 * assertion on final state would notice. That ordering is what the React
 * owner renders between frames: a reordered emit is a flicker or a stale
 * roster, not a wrong end state.
 *
 * When an order change is intended, update the snapshot in its own commit
 * and say why in the message.
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
import type { VoiceUiSink } from '@/services/voice/ui-sink';

const transportFake = vi.hoisted(() => {
  let rosterCb: ((roster: VoicePresence[]) => void) | null = null;
  const publishPresenceBeacon = vi.fn(async () => {});
  const publishLeavePresence = vi.fn(async () => {});
  return {
    publishPresenceBeacon,
    publishLeavePresence,
    subscribeRoster: vi.fn(async (_id: string, cb: (r: VoicePresence[]) => void) => {
      rosterCb = cb;
      return () => { rosterCb = null; };
    }),
    sendSignal: vi.fn(async () => {}),
    subscribeSignals: vi.fn(async (_id: string, _self: string, _cb: (from: string, p: VoiceSignalPayload) => void) => {
      return () => {};
    }),
    getSelfPubkey: vi.fn(() => 'a'.repeat(64)),
    fireRoster: (r: VoicePresence[]) => { rosterCb?.(r); },
    reset: () => { rosterCb = null; publishPresenceBeacon.mockClear(); publishLeavePresence.mockClear(); },
  };
});

vi.mock('@/services/voice/transport', async (importOriginal) => ({
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
  const instances: Array<{ events: Events; closed: boolean }> = [];
  class StubSfuClient {
    private readonly state: typeof instances[number];
    constructor(opts: { events: Events }) {
      this.state = { events: opts.events, closed: false };
      instances.push(this.state);
    }
    async start(): Promise<void> {}
    async publishTrack(): Promise<void> {}
    async unpublishTrack(): Promise<void> {}
    async close(): Promise<void> { this.state.closed = true; }
  }
  return {
    SfuClient: StubSfuClient,
    instances,
    reset: () => { instances.length = 0; },
  };
});
vi.mock('@/services/voice/sfu-client', () => ({ SfuClient: sfuClientFake.SfuClient }));

type ActiveCallEntry = { hostPubkey: string; status: string; participantCount: number; expiresAt: number; createdAt: number };
const bridgeFake = vi.hoisted(() => {
  const cbs: Array<(byChannel: Record<string, ActiveCallEntry>) => void> = [];
  const bridge = {
    subscribeActiveCallByChannel: (cb: (byChannel: Record<string, ActiveCallEntry>) => void) => {
      cbs.push(cb);
      return () => { const i = cbs.indexOf(cb); if (i >= 0) cbs.splice(i, 1); };
    },
    waitForRelayAuth: vi.fn(async () => 'ok'),
    reserveVoiceRelayCapacity: vi.fn(() => () => {}),
  };
  return {
    getBridge: vi.fn(async () => bridge),
    fire: (byChannel: Record<string, ActiveCallEntry>) => { for (const cb of [...cbs]) cb(byChannel); },
    reset: () => { cbs.length = 0; },
  };
});
vi.mock('@/services/nostr-bridge/facade/client', () => ({ getBridge: bridgeFake.getBridge }));

import { VoiceClient, type VoiceClientEvents, type RemoteTrack } from '@/services/voice/client';
import { __resetSharedAudioContextForTests } from '@/services/voice/speaking-detector';

/**
 * jsdom has no AudioContext, so without this every speaking detector fails
 * to construct and `ui.setSpeaking` never appears in the log. A silent
 * context (RMS 0, timers never advanced) lets the detectors attach and
 * their teardown order become visible.
 */
function installSilentAudioContext(): () => void {
  const node = { fftSize: 512, smoothingTimeConstant: 0, connect: () => {}, disconnect: () => {}, getByteTimeDomainData: (buf: Uint8Array) => { buf.fill(128); } };
  class SilentAudioContext {
    state = 'running';
    createMediaStreamSource() { return node; }
    createAnalyser() { return node; }
    async resume() {}
  }
  const w = window as unknown as { AudioContext?: unknown };
  const prev = w.AudioContext;
  w.AudioContext = SilentAudioContext;
  return () => { w.AudioContext = prev; __resetSharedAudioContextForTests(); };
}

const SELF = 'a'.repeat(64);
const PEER1 = 'b'.repeat(64);
const SFU = 'f'.repeat(64);
const NAMES: Record<string, string> = { [SELF]: 'self', [PEER1]: 'peer1', [SFU]: 'sfu' };
const name = (pk: string): string => NAMES[pk] ?? pk.slice(0, 6);

let webrtc: ReturnType<typeof installWebRtcMocks>;
let media: ReturnType<typeof installMediaDevicesMocks>;
let uninstallAudio: () => void;

function presence(pubkey: string): VoicePresence {
  return { pubkey, channelId: 'ch1', createdAt: 1, expiresAt: 9999999999, connectedTo: [], videoTracks: [], isSfu: false };
}

/** One ordered log of everything the client tells the UI. */
function recorder(): { log: string[]; sink: VoiceUiSink; events: VoiceClientEvents; step: (s: string) => void } {
  const log: string[] = [];
  const tracks = (t: RemoteTrack[]) => '[' + t.map((x) => `${name(x.pubkey)}:${x.kind}`).join(' ') + ']';
  const sink: VoiceUiSink = {
    setSignalingDegraded: (d) => { log.push(`ui.setSignalingDegraded(${d})`); },
    setSpeaking: (pk, s) => { log.push(`ui.setSpeaking(${name(pk)}, ${s})`); },
    clearLocalMutes: () => { log.push('ui.clearLocalMutes()'); },
    setPeerMuted: (pk, m) => { log.push(`ui.setPeerMuted(${name(pk)}, ${m})`); },
    setPeerQuality: (pk) => { log.push(`ui.setPeerQuality(${name(pk)})`); },
    clearPeerQuality: (pk) => { log.push(`ui.clearPeerQuality(${name(pk)})`); },
    setError: (m) => { log.push(`ui.setError(${m})`); },
    setLocalTracks: (l) => { log.push(`ui.setLocalTracks(mic=${l.mic} cam=${l.camera} screen=${l.screen})`); },
    readVideoQuality: () => { log.push('ui.readVideoQuality()'); return { videoQuality: 'auto', receivedVideoQuality: 'auto' }; },
  };
  const events: VoiceClientEvents = {
    onParticipantsChange: (p) => { log.push(`events.onParticipantsChange([${p.map(name).join(' ')}])`); },
    onRemoteTracksChange: (t) => { log.push(`events.onRemoteTracksChange(${tracks(t)})`); },
    onLocalTracksChange: (l) => { log.push(`events.onLocalTracksChange(mic=${l.mic} cam=${l.camera} screen=${l.screen})`); },
    onPeerConnectionStatesChange: (s) => {
      log.push(`events.onPeerConnectionStatesChange({${Object.entries(s).map(([k, v]) => `${name(k)}:${v}`).join(' ')}})`);
    },
    onTopologyChange: (s) => { log.push(`events.onTopologyChange(${s ? name(s) : null})`); },
    onError: (m) => { log.push(`events.onError(${m})`); },
    onLeft: () => { log.push('events.onLeft()'); },
  };
  return { log, sink, events, step: (s) => { log.push(`-- ${s}`); } };
}

beforeEach(() => {
  vi.useFakeTimers();
  webrtc = installWebRtcMocks();
  media = installMediaDevicesMocks();
  uninstallAudio = installSilentAudioContext();
  transportFake.reset();
  sfuControlFake.reset();
  sfuClientFake.reset();
  bridgeFake.reset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  webrtc.uninstall();
  media.uninstall();
  uninstallAudio();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('emit order', () => {
  it('mesh: join, one peer connects and sends audio, local mic and camera toggle, the peer closes, leave', async () => {
    const r = recorder();
    const client = new VoiceClient('ch1', { members: [SELF, PEER1], uiSink: r.sink, events: r.events });
    r.step('subscribeRemoteTracks');
    client.subscribeRemoteTracks((t) => { r.log.push(`sub.remoteTracks([${t.map((x) => `${name(x.pubkey)}:${x.kind}`).join(' ')}])`); });

    r.step('join');
    await client.join();

    r.step('roster [peer1]');
    transportFake.fireRoster([presence(PEER1)]);
    await flushMicrotasks(8);

    r.step('peer1 connected');
    const pc = webrtc.last();
    pc.forceState('connected');
    await flushMicrotasks(8);

    r.step('peer1 audio track arrives');
    const remoteAudio = new FakeMediaStreamTrack('audio');
    pc.ontrack?.({ track: remoteAudio, streams: [new FakeMediaStream([remoteAudio])] });
    await flushMicrotasks(8);

    r.step('mic on');
    await client.setMicEnabled(true);
    r.step('camera on');
    await client.setCameraEnabled(true);
    r.step('mic off');
    await client.setMicEnabled(false);
    r.step('deafen');
    client.setDeafenEnabled(true);

    r.step('roster [] (peer1 stays, it is connected)');
    transportFake.fireRoster([]);
    await flushMicrotasks(8);

    r.step('peer1 pc closed');
    pc.forceState('closed');
    await flushMicrotasks(8);

    r.step('leave');
    await client.leave();

    expect(r.log).toMatchInlineSnapshot(`
      [
        "-- subscribeRemoteTracks",
        "sub.remoteTracks([])",
        "-- join",
        "ui.setLocalTracks(mic=false cam=false screen=false)",
        "events.onLocalTracksChange(mic=false cam=false screen=false)",
        "-- roster [peer1]",
        "events.onParticipantsChange([peer1])",
        "events.onPeerConnectionStatesChange({peer1:new})",
        "ui.readVideoQuality()",
        "-- peer1 connected",
        "events.onPeerConnectionStatesChange({peer1:connected})",
        "events.onPeerConnectionStatesChange({peer1:connected})",
        "-- peer1 audio track arrives",
        "events.onRemoteTracksChange([peer1:audio])",
        "sub.remoteTracks([peer1:audio])",
        "-- mic on",
        "ui.setLocalTracks(mic=true cam=false screen=false)",
        "events.onLocalTracksChange(mic=true cam=false screen=false)",
        "-- camera on",
        "ui.readVideoQuality()",
        "ui.setLocalTracks(mic=true cam=true screen=false)",
        "events.onLocalTracksChange(mic=true cam=true screen=false)",
        "-- mic off",
        "ui.setSpeaking(self, false)",
        "ui.setLocalTracks(mic=false cam=true screen=false)",
        "events.onLocalTracksChange(mic=false cam=true screen=false)",
        "-- deafen",
        "-- roster [] (peer1 stays, it is connected)",
        "events.onParticipantsChange([peer1])",
        "-- peer1 pc closed",
        "events.onPeerConnectionStatesChange({peer1:closed})",
        "events.onPeerConnectionStatesChange({})",
        "events.onParticipantsChange([])",
        "ui.setSpeaking(peer1, false)",
        "events.onRemoteTracksChange([])",
        "sub.remoteTracks([])",
        "ui.clearPeerQuality(peer1)",
        "events.onPeerConnectionStatesChange({})",
        "events.onPeerConnectionStatesChange({})",
        "-- leave",
        "events.onPeerConnectionStatesChange({})",
        "events.onRemoteTracksChange([])",
        "sub.remoteTracks([])",
        "ui.clearLocalMutes()",
        "ui.setLocalTracks(mic=false cam=false screen=false)",
        "events.onLocalTracksChange(mic=false cam=false screen=false)",
        "events.onLeft()",
      ]
    `);
  });

  it('sfu: join, the SFU reports a peer and forwards audio, the SFU closes the room, leave', async () => {
    sfuControlFake.setPick(SFU);
    const r = recorder();
    const client = new VoiceClient('ch1', { members: [SELF, PEER1], expectSfu: true, uiSink: r.sink, events: r.events });

    r.step('join');
    const joining = client.join();
    await vi.advanceTimersByTimeAsync(1_000);
    await joining;
    await flushMicrotasks(8);

    const sfu = sfuClientFake.instances[0]!;
    r.step('sfu connected');
    sfu.events.onConnectionStateChange?.('connected');
    r.step('sfu peers [peer1]');
    sfu.events.onPeersChange?.([PEER1]);
    r.step('sfu forwards peer1 audio');
    const stream = new FakeMediaStream([new FakeMediaStreamTrack('audio')]);
    sfu.events.onRemoteTrack?.({ pubkey: PEER1, trackId: 't1', kind: 'audio', stream, consumer: { track: { enabled: true } } });
    r.step('mic on');
    await client.setMicEnabled(true);

    r.step('bridge: call active');
    bridgeFake.fire({ ch1: { hostPubkey: SELF, status: 'active', participantCount: 1, expiresAt: 9_999_999_999, createdAt: 1 } });
    await flushMicrotasks(5);
    r.step('bridge: call gone (SFU closed the room)');
    bridgeFake.fire({});
    await flushMicrotasks(5);

    r.step('leave (before the rejoin timer)');
    await client.leave();

    expect(r.log).toMatchInlineSnapshot(`
      [
        "-- join",
        "ui.setLocalTracks(mic=false cam=false screen=false)",
        "events.onLocalTracksChange(mic=false cam=false screen=false)",
        "events.onTopologyChange(sfu)",
        "-- sfu connected",
        "-- sfu peers [peer1]",
        "events.onParticipantsChange([peer1])",
        "-- sfu forwards peer1 audio",
        "events.onRemoteTracksChange([peer1:audio])",
        "-- mic on",
        "ui.setLocalTracks(mic=true cam=false screen=false)",
        "events.onLocalTracksChange(mic=true cam=false screen=false)",
        "-- bridge: call active",
        "-- bridge: call gone (SFU closed the room)",
        "ui.setSpeaking(peer1, false)",
        "events.onRemoteTracksChange([])",
        "events.onTopologyChange(null)",
        "-- leave (before the rejoin timer)",
        "events.onPeerConnectionStatesChange({})",
        "events.onRemoteTracksChange([])",
        "ui.setSpeaking(self, false)",
        "ui.clearLocalMutes()",
        "ui.setLocalTracks(mic=false cam=false screen=false)",
        "events.onLocalTracksChange(mic=false cam=false screen=false)",
        "events.onLeft()",
      ]
    `);
  });

  it('topology flip: an SFU call reclassified to mesh, then back', async () => {
    sfuControlFake.setPick(SFU);
    const r = recorder();
    const client = new VoiceClient('ch1', { members: [SELF, PEER1], expectSfu: true, uiSink: r.sink, events: r.events });
    const joining = client.join();
    await vi.advanceTimersByTimeAsync(1_000);
    await joining;
    await flushMicrotasks(8);
    const sfu = sfuClientFake.instances[0]!;
    sfu.events.onPeersChange?.([PEER1]);
    const stream = new FakeMediaStream([new FakeMediaStreamTrack('audio')]);
    sfu.events.onRemoteTrack?.({ pubkey: PEER1, trackId: 't1', kind: 'audio', stream, consumer: { track: { enabled: true } } });

    r.step('setExpectSfu(false)');
    client.setExpectSfu(false);
    await flushMicrotasks(16);

    r.step('setExpectSfu(true)');
    client.setExpectSfu(true);
    await vi.advanceTimersByTimeAsync(1_000);
    await flushMicrotasks(16);

    r.step('leave');
    await client.leave();

    expect(r.log).toMatchInlineSnapshot(`
      [
        "ui.setLocalTracks(mic=false cam=false screen=false)",
        "events.onLocalTracksChange(mic=false cam=false screen=false)",
        "events.onTopologyChange(sfu)",
        "events.onParticipantsChange([peer1])",
        "events.onRemoteTracksChange([peer1:audio])",
        "-- setExpectSfu(false)",
        "ui.setSpeaking(peer1, false)",
        "events.onRemoteTracksChange([])",
        "events.onParticipantsChange([])",
        "events.onTopologyChange(null)",
        "-- setExpectSfu(true)",
        "events.onPeerConnectionStatesChange({})",
        "events.onTopologyChange(sfu)",
        "-- leave",
        "events.onPeerConnectionStatesChange({})",
        "events.onRemoteTracksChange([])",
        "ui.clearLocalMutes()",
        "ui.setLocalTracks(mic=false cam=false screen=false)",
        "events.onLocalTracksChange(mic=false cam=false screen=false)",
        "events.onLeft()",
      ]
    `);
  });
});
