import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { DmCallSession, type DmCallMediaState, type DmCallPhase } from '@/services/dm-call/session';
import { fakeEphemeralRelay, type FakeEphemeralRelay } from '@/services/dm-call/fake-ephemeral-relay';
import type { Peer, PeerOptions } from '@/services/voice/peer';
import type { VoiceSignalPayload } from '@/services/voice/types';

class FakeTrack {
  enabled = true;
  readyState: 'live' | 'ended' = 'live';
  contentHint = '';
  constructor(public kind: 'audio' | 'video', public id = Math.random().toString(36).slice(2)) {}
  stop() { this.readyState = 'ended'; }
  addEventListener() {}
}
class FakeStream {
  constructor(private tracks: FakeTrack[] = []) {}
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks.filter((t) => t.kind === 'audio'); }
  getVideoTracks() { return this.tracks.filter((t) => t.kind === 'video'); }
}

/**
 * A Peer that negotiates for real at the signalling level: the initiator
 * offers on kick, the polite side answers, both "connect" once the exchange
 * completes. Session binding mirrors the real Peer: the first signal fixes
 * the remote session, and an offer from another session is handed to
 * `onRemoteSessionChanged`.
 */
interface FakePeer {
  opts: PeerOptions;
  closed: { notifyRemote?: boolean } | null;
  local: Map<string, unknown>;
  kicked: boolean;
  requestedReset: boolean;
}
function fakePeerFactory(peers: FakePeer[]) {
  return (opts: PeerOptions): Peer => {
    const fp: FakePeer = { opts, closed: null, local: new Map(), kicked: false, requestedReset: false };
    peers.push(fp);
    let remoteSession: string | null = null;
    let seq = 0;
    let connected = false;
    const send = (type: VoiceSignalPayload['type']) => void opts.send({ type, sessionId: opts.sessionId, seq: ++seq, sdp: 'v=0' });
    const connect = () => { if (!connected && !fp.closed) { connected = true; opts.events.onConnectionEstablished?.(); } };
    return {
      setLocalTrack: async (kind: string, track: unknown) => { fp.local.set(kind, track); },
      setLocalVideoCap: async () => {},
      kickInitialOffer: async () => { fp.kicked = true; send('offer'); },
      handleSignal: async (p: VoiceSignalPayload) => {
        if (fp.closed) return;
        if (p.type === 'bye') { opts.events.onPeerDead?.('bye:local-leave'); return; }
        if (remoteSession && p.sessionId !== remoteSession) {
          if (p.type === 'offer') opts.events.onRemoteSessionChanged?.(p);
          return;
        }
        remoteSession = p.sessionId;
        if (p.type === 'offer' && opts.polite) { send('answer'); connect(); }
        if (p.type === 'answer' && !opts.polite) connect();
      },
      requestReset: () => { fp.requestedReset = true; },
      close: (o: { notifyRemote?: boolean } = {}) => {
        fp.closed = o;
        if (o.notifyRemote !== false) void opts.send({ type: 'bye', sessionId: opts.sessionId, seq: ++seq });
      },
    } as unknown as Peer;
  };
}

function side(role: 'caller' | 'callee', relay: FakeEphemeralRelay, video = false) {
  const peers: FakePeer[] = [];
  const phases: Array<[DmCallPhase, string | undefined]> = [];
  let media: DmCallMediaState | null = null;
  let joined = 0;
  const session = new DmCallSession({
    role,
    callId: 'a'.repeat(64),
    selfSk: generateSecretKey(),
    relays: ['wss://call.example'],
    video,
    iceTransportPolicy: 'all',
    onPhase: (p, r) => phases.push([p, r]),
    onMedia: (m) => { media = m; },
    onPeerJoined: () => { joined++; },
    pool: relay.pool,
    getUserMedia: async (c) => new FakeStream(c.audio ? [new FakeTrack('audio')] : [new FakeTrack('video')]) as unknown as MediaStream,
    createPeer: fakePeerFactory(peers),
  });
  return { session, peers, phases, media: () => media, joined: () => joined };
}

/** Run the whole handshake: invite (caller listens), callee answers. */
async function call(relay: FakeEphemeralRelay, opts: { acceptVia?: 'hello' | 'wrap' | 'both' } = {}) {
  const caller = side('caller', relay, true);
  const callee = side('callee', relay);
  await caller.session.acquireMedia();
  caller.session.listen();
  await callee.session.acquireMedia();
  void callee.session.answer(caller.session.selfEph);
  if (opts.acceptVia === 'wrap' || opts.acceptVia === 'both') caller.session.peerAccepted(callee.session.selfEph);
  return { caller, callee };
}

const connected = (h: { phases: Array<[DmCallPhase, string | undefined]> }) => h.phases.some(([p]) => p === 'connected');

describe('DmCallSession', () => {
  beforeEach(() => {
    vi.stubGlobal('MediaStream', FakeStream);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connects through the call-relay hello alone, with the caller offering', async () => {
    const relay = fakeEphemeralRelay();
    const { caller, callee } = await call(relay);
    await vi.advanceTimersByTimeAsync(500);
    expect(caller.joined()).toBe(1);
    expect(caller.peers[0].opts.polite).toBe(false);
    expect(caller.peers[0].kicked).toBe(true);
    expect(callee.peers[0].opts.polite).toBe(true);
    expect(connected(caller)).toBe(true);
    expect(connected(callee)).toBe(true);
    // One Peer each: no rebuilds on the happy path.
    expect(caller.peers).toHaveLength(1);
    expect(callee.peers).toHaveLength(1);
  });

  it('attaches mic and camera to the caller Peer', async () => {
    const relay = fakeEphemeralRelay();
    const { caller } = await call(relay);
    await vi.advanceTimersByTimeAsync(500);
    expect(caller.peers[0].local.has('audio')).toBe(true);
    expect(caller.peers[0].local.has('camera')).toBe(true);
    expect(caller.media()?.cameraOn).toBe(true);
  });

  it('connects via the gift-wrapped accept when the hello is lost', async () => {
    // Drop every hello-bearing event from the callee for the first seconds.
    const relay = fakeEphemeralRelay({ drop: (_ev, n) => n < 4 });
    const { caller, callee } = await call(relay, { acceptVia: 'wrap' });
    await vi.advanceTimersByTimeAsync(8000);
    expect(connected(caller)).toBe(true);
    expect(connected(callee)).toBe(true);
  });

  // The regression this rewrite exists for: slow subscriptions and lossy
  // relays used to strand the offer or the answer until a 12 s rebuild.
  // Loss is random but seeded, so a failure reproduces.
  const seeded = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (const [label, liveDelayMs, loss, windowMs] of [
    ['slow REQs (2 s to go live)', 2000, 0, 6_000],
    ['30% of events lost', 50, 0.3, 10_000],
    ['slow REQs and 30% lost', 1500, 0.3, 12_000],
    ['50% of events lost', 200, 0.5, 20_000],
  ] as const) {
    for (const seed of [1, 7, 42, 1234, 99991]) {
      it(`connects without a rebuild with ${label} (seed ${seed})`, async () => {
        const rand = seeded(seed);
        const relay = fakeEphemeralRelay({ liveDelayMs, drop: () => rand() < loss });
        const { caller, callee } = await call(relay, { acceptVia: 'both' });
        await vi.advanceTimersByTimeAsync(windowMs);
        expect(connected(caller)).toBe(true);
        expect(connected(callee)).toBe(true);
        expect(caller.peers).toHaveLength(1);
      });
    }
  }

  it('ends when the other side says bye', async () => {
    const relay = fakeEphemeralRelay();
    const { caller, callee } = await call(relay);
    await vi.advanceTimersByTimeAsync(500);
    callee.session.hangup();
    await vi.advanceTimersByTimeAsync(500);
    expect(caller.phases.at(-1)).toEqual(['ended', 'remote-hangup']);
    expect(callee.phases.at(-1)).toEqual(['ended', 'local-hangup']);
  });

  it('gives up with connect-failed when nobody ever answers on the call relay', async () => {
    const relay = fakeEphemeralRelay({ drop: () => true });
    const { caller } = await call(relay, { acceptVia: 'wrap' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(caller.phases.at(-1)).toEqual(['ended', 'connect-failed']);
  });

  it('a dropped connected call reconnects, and is ended if it stays down', async () => {
    const relay = fakeEphemeralRelay();
    const { caller } = await call(relay);
    await vi.advanceTimersByTimeAsync(500);
    caller.peers[0].opts.events.onConnectionLost?.();
    expect(caller.phases.at(-1)?.[0]).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(31_000);
    expect(caller.phases.at(-1)).toEqual(['ended', 'connection-lost']);
  });

  it('a caller rebuild is followed by the callee, and old-session re-sends are ignored', async () => {
    const relay = fakeEphemeralRelay();
    const { caller, callee } = await call(relay);
    await vi.advanceTimersByTimeAsync(500);
    caller.peers[0].opts.events.onPeerDead?.('heartbeat-lost');
    await vi.advanceTimersByTimeAsync(2000);
    expect(caller.peers).toHaveLength(2);
    expect(callee.peers).toHaveLength(2);
    expect(callee.peers[1].closed).toBeNull();
    // Settles: no further rebuild ping-pong from old-session re-sends.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(caller.peers).toHaveLength(2);
    expect(callee.peers).toHaveLength(2);
  });

  describe('media granted after end() is stopped, not left live', () => {
    /**
     * The DM-call half of the round 7 microphone leak: the browser's
     * permission prompt resolves after the call ended (the other side hung
     * up while the prompt was open, or the caller cancelled). Whatever the
     * browser hands back then must be stopped on the spot.
     */
    function deferredMedia(video: boolean) {
      const grants: Array<{ tracks: FakeTrack[]; resolve: () => void }> = [];
      const gate = (tracks: FakeTrack[]) => new Promise<MediaStream>((resolve) => {
        grants.push({ tracks, resolve: () => resolve(new FakeStream(tracks) as unknown as MediaStream) });
      });
      const session = new DmCallSession({
        role: 'caller',
        callId: 'a'.repeat(64),
        selfSk: generateSecretKey(),
        relays: ['wss://call.example'],
        video,
        iceTransportPolicy: 'all',
        onPhase: () => {},
        onMedia: () => {},
        pool: fakeEphemeralRelay().pool,
        createPeer: fakePeerFactory([]),
        getUserMedia: (c) => gate(c.audio ? [new FakeTrack('audio')] : [new FakeTrack('video')]),
        getDisplayMedia: () => gate([new FakeTrack('video'), new FakeTrack('audio')]),
      });
      return { session, grants };
    }

    it('a microphone granted after end() is stopped', async () => {
      const { session, grants } = deferredMedia(false);
      const acquiring = session.acquireMedia();
      expect(grants).toHaveLength(1);
      session.end('remote-hangup');
      grants[0].resolve();
      await acquiring;
      expect(grants[0].tracks[0].readyState).toBe('ended');
    });

    it('a camera granted after end() is stopped', async () => {
      const { session, grants } = deferredMedia(true);
      const acquiring = session.acquireMedia();
      grants[0].resolve(); // mic
      await vi.advanceTimersByTimeAsync(0);
      expect(grants).toHaveLength(2); // camera prompt is open
      session.end('remote-hangup');
      grants[1].resolve();
      await acquiring;
      expect(grants[0].tracks[0].readyState).toBe('ended');
      expect(grants[1].tracks[0].readyState).toBe('ended');
    });

    it('a camera or screen share toggled on after end() is stopped', async () => {
      const { session, grants } = deferredMedia(false);
      const cam = session.setCamera(true);
      const screen = session.setScreenShare(true);
      expect(grants).toHaveLength(2);
      session.end('local-hangup');
      grants[0].resolve();
      grants[1].resolve();
      await Promise.all([cam, screen]);
      for (const grant of grants) for (const t of grant.tracks) expect(t.readyState).toBe('ended');
    });

    it('a Peer that refuses to close cannot keep the microphone live after end()', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const phases: Array<[DmCallPhase, string | undefined]> = [];
      const mic = new FakeTrack('audio');
      const session = new DmCallSession({
        role: 'caller',
        callId: 'a'.repeat(64),
        selfSk: generateSecretKey(),
        relays: ['wss://call.example'],
        video: false,
        iceTransportPolicy: 'all',
        onPhase: (p, r) => phases.push([p, r]),
        onMedia: () => {},
        pool: fakeEphemeralRelay().pool,
        getUserMedia: async () => new FakeStream([mic]) as unknown as MediaStream,
        createPeer: () => ({
          setLocalTrack: async () => {},
          setLocalVideoCap: async () => {},
          kickInitialOffer: async () => {},
          handleSignal: async () => {},
          requestReset: () => {},
          close: () => { throw new Error('destroy exploded'); },
        } as unknown as Peer),
      });
      await session.acquireMedia();
      session.listen();
      session.peerAccepted(getPublicKey(generateSecretKey()));
      await vi.advanceTimersByTimeAsync(5000);
      session.hangup();
      expect(mic.readyState).toBe('ended');
      expect(phases.at(-1)).toEqual(['ended', 'local-hangup']);
      expect(warn).toHaveBeenCalledWith('[dm-call] peer.close threw on end; the call is over anyway', expect.any(Error));
      warn.mockRestore();
    });

    it('acquireMedia on an already-ended session never prompts', async () => {
      const { session, grants } = deferredMedia(true);
      session.end('local-hangup');
      await session.acquireMedia();
      await session.setCamera(true);
      await session.setScreenShare(true);
      expect(grants).toHaveLength(0);
    });
  });

  describe('a second acquisition of the same kind while the prompt is open', () => {
    /**
     * The other half of the round 7 permission-prompt race: two camera
     * toggles (or two flips, or acquireMedia and a toggle) overlap while
     * the browser's prompt is open. Whichever track arrives second must
     * be stopped, or it stays live, unpublished and unreachable.
     */
    function overlapping(video: boolean) {
      const grants: Array<{ tracks: FakeTrack[]; resolve: () => void }> = [];
      const gate = (tracks: FakeTrack[]) => new Promise<MediaStream>((resolve) => {
        grants.push({ tracks, resolve: () => resolve(new FakeStream(tracks) as unknown as MediaStream) });
      });
      const peers: FakePeer[] = [];
      let media: DmCallMediaState | null = null;
      const session = new DmCallSession({
        role: 'caller',
        callId: 'a'.repeat(64),
        selfSk: generateSecretKey(),
        relays: ['wss://call.example'],
        video,
        iceTransportPolicy: 'all',
        onPhase: () => {},
        onMedia: (m) => { media = m; },
        pool: fakeEphemeralRelay().pool,
        createPeer: fakePeerFactory(peers),
        getUserMedia: (c) => gate(c.audio ? [new FakeTrack('audio')] : [new FakeTrack('video')]),
      });
      const live = () => grants.flatMap((g) => g.tracks).filter((t) => t.readyState === 'live');
      return { session, grants, peers, media: () => media, live };
    }

    it('two camera toggles keep one camera; turning it off leaves none live', async () => {
      const { session, grants, media, live } = overlapping(false);
      const first = session.setCamera(true);
      const second = session.setCamera(true);
      expect(grants).toHaveLength(2);
      grants[0].resolve();
      grants[1].resolve();
      await Promise.all([first, second]);
      expect(live().map((t) => t.kind)).toEqual(['video']);
      expect(media()?.cameraOn).toBe(true);
      await session.setCamera(false);
      expect(live()).toEqual([]);
      expect(media()?.cameraOn).toBe(false);
    });

    it('two flips keep one camera, and the old one is stopped', async () => {
      const { session, grants, live } = overlapping(false);
      const on = session.setCamera(true);
      grants[0].resolve();
      await on;
      const flip1 = session.flipCamera();
      const flip2 = session.flipCamera();
      expect(grants).toHaveLength(3);
      grants[1].resolve();
      grants[2].resolve();
      await Promise.all([flip1, flip2]);
      expect(live()).toHaveLength(1);
      expect(live()[0]).toBe(grants[1].tracks[0]);
    });

    it('a camera toggled on during a video call\'s own camera prompt does not leave a second camera live', async () => {
      const { session, grants, live } = overlapping(true);
      const acquiring = session.acquireMedia();
      grants[0].resolve(); // mic
      await vi.advanceTimersByTimeAsync(0);
      expect(grants).toHaveLength(2); // the call's camera prompt is open
      const toggled = session.setCamera(true);
      expect(grants).toHaveLength(3);
      grants[2].resolve();
      grants[1].resolve();
      await Promise.all([acquiring, toggled]);
      expect(live().filter((t) => t.kind === 'video')).toHaveLength(1);
    });

    it('a mute during the microphone prompt applies to the microphone it grants', async () => {
      const { session, grants, media } = overlapping(false);
      const acquiring = session.acquireMedia();
      session.setMic(false);
      grants[0].resolve();
      await acquiring;
      expect(grants[0].tracks[0].enabled).toBe(false);
      expect(media()?.micOn).toBe(false);
    });
  });

  it('mute flips the mic track, hangup stops every track', async () => {
    const relay = fakeEphemeralRelay();
    const { caller } = await call(relay);
    await vi.advanceTimersByTimeAsync(500);
    caller.session.setMic(false);
    const mic = caller.peers[0].local.get('audio') as FakeTrack;
    expect(mic.enabled).toBe(false);
    expect(caller.media()?.micOn).toBe(false);
    caller.session.hangup();
    expect(caller.peers[0].closed).toEqual({ notifyRemote: true });
    expect(mic.readyState).toBe('ended');
    expect((caller.peers[0].local.get('camera') as FakeTrack).readyState).toBe('ended');
  });
});
