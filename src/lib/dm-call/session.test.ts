import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { DmCallSession, type DmCallMediaState, type DmCallPhase } from './session';
import type { CallPoolLike } from './signaling';
import type { Peer, PeerOptions } from '@/lib/voice/peer';

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

const PEER_EPH = getPublicKey(generateSecretKey());

interface FakePeer {
  opts: PeerOptions;
  closed: { notifyRemote?: boolean } | null;
  local: Map<string, unknown>;
  kicked: boolean;
  signals: unknown[];
  requestedReset: boolean;
}

function harness(role: 'caller' | 'callee', video = false) {
  const peers: FakePeer[] = [];
  const phases: Array<[DmCallPhase, string | undefined]> = [];
  let media: DmCallMediaState | null = null;
  const pool: CallPoolLike = {
    subscribe: () => ({ close: () => {} }),
    publish: () => [Promise.resolve('ok')],
  };
  const session = new DmCallSession({
    role,
    callId: 'a'.repeat(64),
    selfSk: generateSecretKey(),
    relays: ['wss://call.example'],
    video,
    iceTransportPolicy: 'all',
    onPhase: (p, r) => phases.push([p, r]),
    onMedia: (m) => { media = m; },
    pool,
    getUserMedia: async (c) => new FakeStream(c.audio ? [new FakeTrack('audio')] : [new FakeTrack('video')]) as unknown as MediaStream,
    createPeer: (opts) => {
      const fp: FakePeer = { opts, closed: null, local: new Map(), kicked: false, signals: [], requestedReset: false };
      peers.push(fp);
      return {
        setLocalTrack: async (kind: string, track: unknown) => { fp.local.set(kind, track); },
        setLocalVideoCap: async () => {},
        kickInitialOffer: async () => { fp.kicked = true; },
        handleSignal: async (p: unknown) => { fp.signals.push(p); },
        requestReset: () => { fp.requestedReset = true; },
        close: (o: { notifyRemote?: boolean } = {}) => { fp.closed = o; },
      } as unknown as Peer;
    },
  });
  return { session, peers, phases, media: () => media };
}

describe('DmCallSession', () => {
  beforeEach(() => {
    vi.stubGlobal('MediaStream', FakeStream);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('caller is the impolite initiator and attaches mic + camera', async () => {
    const h = harness('caller', true);
    await h.session.acquireMedia();
    h.session.openSignaling(PEER_EPH);
    h.session.connect();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.peers).toHaveLength(1);
    expect(h.peers[0].opts.polite).toBe(false);
    expect(h.peers[0].kicked).toBe(true);
    expect(h.peers[0].local.has('audio')).toBe(true);
    expect(h.peers[0].local.has('camera')).toBe(true);
    expect(h.media()?.cameraOn).toBe(true);
  });

  it('callee is polite and builds on the first signal if needed', async () => {
    const h = harness('callee');
    await h.session.acquireMedia();
    h.session.openSignaling(PEER_EPH);
    h.session.connect();
    expect(h.peers[0].opts.polite).toBe(true);
    expect(h.peers[0].kicked).toBe(false);
  });

  it('connects, and ends when the other side says bye', async () => {
    const h = harness('caller');
    await h.session.acquireMedia();
    h.session.openSignaling(PEER_EPH);
    h.session.connect();
    h.peers[0].opts.events.onConnectionEstablished?.();
    expect(h.phases.at(-1)?.[0]).toBe('connected');
    h.peers[0].opts.events.onPeerDead?.('bye:local-leave');
    expect(h.phases.at(-1)).toEqual(['ended', 'remote-hangup']);
  });

  it('caller rebuilds on an open timeout and gives up after a few tries', async () => {
    const h = harness('caller');
    await h.session.acquireMedia();
    h.session.openSignaling(PEER_EPH);
    h.session.connect();
    for (let i = 0; i < 4; i++) {
      h.peers.at(-1)!.opts.events.onPeerDead?.('open-timeout');
      expect(h.peers.at(-2)!.requestedReset).toBe(true);
    }
    expect(h.peers).toHaveLength(5);
    h.peers.at(-1)!.opts.events.onPeerDead?.('open-timeout');
    expect(h.phases.at(-1)).toEqual(['ended', 'connect-failed']);
  });

  it('a dropped connected call reconnects, and is ended if it stays down', async () => {
    const h = harness('caller');
    await h.session.acquireMedia();
    h.session.openSignaling(PEER_EPH);
    h.session.connect();
    h.peers[0].opts.events.onConnectionEstablished?.();
    h.peers[0].opts.events.onConnectionLost?.();
    expect(h.phases.at(-1)?.[0]).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(31_000);
    expect(h.phases.at(-1)).toEqual(['ended', 'connection-lost']);
  });

  it('mute flips the mic track, hangup stops every track and tells the peer', async () => {
    const h = harness('caller', true);
    await h.session.acquireMedia();
    h.session.openSignaling(PEER_EPH);
    h.session.connect();
    await vi.advanceTimersByTimeAsync(0);
    h.session.setMic(false);
    const mic = h.peers[0].local.get('audio') as FakeTrack;
    expect(mic.enabled).toBe(false);
    expect(h.media()?.micOn).toBe(false);
    h.session.hangup();
    expect(h.peers[0].closed).toEqual({ notifyRemote: true });
    expect(mic.readyState).toBe('ended');
    expect((h.peers[0].local.get('camera') as FakeTrack).readyState).toBe('ended');
    expect(h.phases.at(-1)).toEqual(['ended', 'local-hangup']);
  });
});
