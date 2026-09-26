import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { DmCallSession, type DmCallMediaState, type DmCallPhase } from './session';
import { fakeEphemeralRelay, type FakeEphemeralRelay } from './fake-ephemeral-relay';
import type { Peer, PeerOptions } from '@/lib/voice/peer';
import type { VoiceSignalPayload } from '@/lib/voice/types';

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
    // A late re-send of the first session's offer must not pull the callee back.
    callee.peers[1].opts.events.onRemoteSessionChanged; // noop reference
    expect(callee.peers.length).toBe(2);
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
