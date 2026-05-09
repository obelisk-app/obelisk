import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ControlChannel,
  CONTROL_CHANNEL_LABEL,
  PING_INTERVAL_MS,
  DEAD_PEER_TIMEOUT_MS,
  OPEN_TIMEOUT_MS,
  type ControlMessage,
} from './control-channel';
import { emptyVoiceMetrics, type VoiceMetrics } from './metrics';

class FakeDataChannel {
  readyState: 'connecting' | 'open' | 'closing' | 'closed' = 'connecting';
  label: string;
  ordered = true;
  onopen: (() => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  twin: FakeDataChannel | null = null;

  constructor(label = CONTROL_CHANNEL_LABEL) {
    this.label = label;
  }

  send(data: string) {
    if (this.readyState !== 'open') throw new Error('not open');
    this.sent.push(data);
    if (this.twin) {
      // Echo to the paired channel asynchronously, like a real DC.
      Promise.resolve().then(() => {
        if (this.twin?.readyState !== 'open') return;
        this.twin?.onmessage?.(new MessageEvent('message', { data }));
      });
    }
  }

  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    Promise.resolve().then(() => this.onclose?.());
    if (this.twin && this.twin.readyState === 'open') {
      const twin = this.twin;
      Promise.resolve().then(() => {
        twin.readyState = 'closed';
        twin.onclose?.();
      });
    }
  }

  open() {
    this.readyState = 'open';
    this.onopen?.();
  }
}

class FakePc {
  ondatachannel: ((ev: { channel: FakeDataChannel }) => void) | null = null;
  channels: FakeDataChannel[] = [];

  createDataChannel(label: string, _init?: RTCDataChannelInit): FakeDataChannel {
    const dc = new FakeDataChannel(label);
    this.channels.push(dc);
    return dc;
  }

  /** Test helper — link a remote PC's adopted channel to ours so messages flow. */
  linkTwin(otherPc: FakePc, ourLabel = CONTROL_CHANNEL_LABEL): { ours: FakeDataChannel; theirs: FakeDataChannel } {
    const ours = this.channels.find((c) => c.label === ourLabel);
    if (!ours) throw new Error('no channel of label ' + ourLabel);
    const theirs = new FakeDataChannel(ourLabel);
    ours.twin = theirs;
    theirs.twin = ours;
    otherPc.ondatachannel?.({ channel: theirs });
    return { ours, theirs };
  }
}

function makeEvents() {
  return {
    onHello: vi.fn<(peers: string[], build: string) => void>(),
    onPeerAdded: vi.fn<(pubkey: string) => void>(),
    onPeerRemoved: vi.fn<(pubkey: string) => void>(),
    onBye: vi.fn<(reason: string) => void>(),
    onDead: vi.fn<(reason: 'heartbeat-lost' | 'open-timeout' | 'channel-closed') => void>(),
    onRtt: vi.fn<(ms: number) => void>(),
  };
}

describe('ControlChannel', () => {
  let metrics: VoiceMetrics;

  beforeEach(() => {
    metrics = emptyVoiceMetrics();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('impolite side creates the data channel; polite side adopts via ondatachannel', async () => {
    const impPc = new FakePc();
    const polPc = new FakePc();
    const impEv = makeEvents();
    const polEv = makeEvents();

    const imp = new ControlChannel({
      pc: impPc as unknown as RTCPeerConnection,
      impolite: true,
      sessionId: 'imp-s',
      selfBuild: 'imp-b',
      remotePubkey: 'pol',
      initialPeers: () => ['extra1'],
      events: impEv,
      metrics,
    });
    const pol = new ControlChannel({
      pc: polPc as unknown as RTCPeerConnection,
      impolite: false,
      sessionId: 'pol-s',
      selfBuild: 'pol-b',
      remotePubkey: 'imp',
      initialPeers: () => ['extra2'],
      events: polEv,
      metrics,
    });

    expect(impPc.channels).toHaveLength(1);
    expect(impPc.channels[0].label).toBe(CONTROL_CHANNEL_LABEL);
    expect(polPc.channels).toHaveLength(0); // polite does not create

    // Wire them up; both channels open.
    impPc.linkTwin(polPc);
    impPc.channels[0].open();
    polPc.channels[0]?.open?.(); // polite has no own channel; the linked twin is on its ondatachannel adopted handle
    // The polite side's adopted channel is the one created by `linkTwin`.
    // Find and open it via the twin reference.
    const polAdopted = impPc.channels[0].twin!;
    polAdopted.open();

    // Allow microtasks to flush (message echo path is async).
    await Promise.resolve();
    await Promise.resolve();

    // Both saw a hello from the other side.
    expect(impEv.onHello).toHaveBeenCalledWith(['extra2'], 'pol-b');
    expect(polEv.onHello).toHaveBeenCalledWith(['extra1'], 'imp-b');
    expect(metrics.controlChannel.opened).toBe(2);

    imp.close();
    pol.close();
  });

  it('emits onPeerAdded / onPeerRemoved when remote sends them', async () => {
    const impPc = new FakePc();
    const polPc = new FakePc();
    const impEv = makeEvents();
    const polEv = makeEvents();
    const imp = new ControlChannel({
      pc: impPc as unknown as RTCPeerConnection,
      impolite: true, sessionId: 's', selfBuild: 'b', remotePubkey: 'pol',
      initialPeers: () => [], events: impEv, metrics,
    });
    new ControlChannel({
      pc: polPc as unknown as RTCPeerConnection,
      impolite: false, sessionId: 's', selfBuild: 'b', remotePubkey: 'imp',
      initialPeers: () => [], events: polEv, metrics,
    });
    impPc.linkTwin(polPc);
    impPc.channels[0].open();
    impPc.channels[0].twin!.open();
    await Promise.resolve(); await Promise.resolve();

    imp.send({ type: 'peerAdded', pubkey: 'newPeer' });
    await Promise.resolve(); await Promise.resolve();
    expect(polEv.onPeerAdded).toHaveBeenCalledWith('newPeer');

    imp.send({ type: 'peerRemoved', pubkey: 'newPeer' });
    await Promise.resolve(); await Promise.resolve();
    expect(polEv.onPeerRemoved).toHaveBeenCalledWith('newPeer');
  });

  it('ping/pong updates RTT and resets the dead-peer timer', async () => {
    const impPc = new FakePc();
    const polPc = new FakePc();
    const impEv = makeEvents();
    const polEv = makeEvents();

    new ControlChannel({
      pc: impPc as unknown as RTCPeerConnection,
      impolite: true, sessionId: 's', selfBuild: 'b', remotePubkey: 'pol',
      initialPeers: () => [], events: impEv, metrics,
    });
    new ControlChannel({
      pc: polPc as unknown as RTCPeerConnection,
      impolite: false, sessionId: 's', selfBuild: 'b', remotePubkey: 'imp',
      initialPeers: () => [], events: polEv, metrics,
    });
    impPc.linkTwin(polPc);
    impPc.channels[0].open();
    impPc.channels[0].twin!.open();
    await vi.advanceTimersByTimeAsync(0);

    // Trigger one ping cycle.
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS);
    // Allow the pong message to round-trip.
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve(); await Promise.resolve();

    expect(metrics.controlChannel.pingSent).toBeGreaterThanOrEqual(1);
    expect(metrics.controlChannel.pongRcvd).toBeGreaterThanOrEqual(1);
    expect(metrics.controlChannel.lastRttMs).not.toBeNull();
    expect(impEv.onRtt).toHaveBeenCalled();
  });

  it('fires onDead("heartbeat-lost") when no traffic for DEAD_PEER_TIMEOUT_MS', async () => {
    // Single side, never twinned — open the channel so the dead timer
    // arms, then advance past the threshold without any inbound traffic.
    const impPc = new FakePc();
    const events = makeEvents();
    new ControlChannel({
      pc: impPc as unknown as RTCPeerConnection,
      impolite: true, sessionId: 's', selfBuild: 'b', remotePubkey: 'pol',
      initialPeers: () => [], events, metrics,
    });
    impPc.channels[0].open();
    await vi.advanceTimersByTimeAsync(DEAD_PEER_TIMEOUT_MS + 100);
    expect(events.onDead).toHaveBeenCalledWith('heartbeat-lost');
  });

  it('fires onDead("open-timeout") when the channel never opens', async () => {
    const impPc = new FakePc();
    const events = makeEvents();
    new ControlChannel({
      pc: impPc as unknown as RTCPeerConnection,
      impolite: true, sessionId: 's', selfBuild: 'b', remotePubkey: 'pol',
      initialPeers: () => [], events, metrics,
    });
    // Never call open()
    await vi.advanceTimersByTimeAsync(OPEN_TIMEOUT_MS + 100);
    expect(events.onDead).toHaveBeenCalledWith('open-timeout');
  });

  it('bye flips closed state and notifies onBye exactly once', async () => {
    const impPc = new FakePc();
    const polPc = new FakePc();
    const impEv = makeEvents();
    const polEv = makeEvents();
    const imp = new ControlChannel({
      pc: impPc as unknown as RTCPeerConnection,
      impolite: true, sessionId: 's', selfBuild: 'b', remotePubkey: 'pol',
      initialPeers: () => [], events: impEv, metrics,
    });
    new ControlChannel({
      pc: polPc as unknown as RTCPeerConnection,
      impolite: false, sessionId: 's', selfBuild: 'b', remotePubkey: 'imp',
      initialPeers: () => [], events: polEv, metrics,
    });
    impPc.linkTwin(polPc);
    impPc.channels[0].open();
    impPc.channels[0].twin!.open();
    await Promise.resolve(); await Promise.resolve();

    imp.close('local-leave');
    await Promise.resolve(); await Promise.resolve();
    expect(polEv.onBye).toHaveBeenCalledWith('local-leave');
    expect(polEv.onBye).toHaveBeenCalledTimes(1);
  });

  it('idempotent close()', () => {
    const impPc = new FakePc();
    const events = makeEvents();
    const ch = new ControlChannel({
      pc: impPc as unknown as RTCPeerConnection,
      impolite: true, sessionId: 's', selfBuild: 'b', remotePubkey: 'pol',
      initialPeers: () => [], events, metrics,
    });
    ch.close();
    ch.close(); // no throw
    expect(events.onDead).not.toHaveBeenCalled();
  });

  it('send() is a no-op before open and after close', () => {
    const impPc = new FakePc();
    const events = makeEvents();
    const ch = new ControlChannel({
      pc: impPc as unknown as RTCPeerConnection,
      impolite: true, sessionId: 's', selfBuild: 'b', remotePubkey: 'pol',
      initialPeers: () => [], events, metrics,
    });
    expect(() => ch.send({ type: 'ping', ts: 1 })).not.toThrow();
    ch.close();
    expect(() => ch.send({ type: 'ping', ts: 2 })).not.toThrow();
  });
});

describe('ControlMessage shape', () => {
  it('round-trips through JSON.stringify / parse', () => {
    const msgs: ControlMessage[] = [
      { type: 'hello', peers: ['a', 'b'], sessionId: 's', build: 'b' },
      { type: 'peerAdded', pubkey: 'x' },
      { type: 'peerRemoved', pubkey: 'y' },
      { type: 'bye', reason: 'r' },
      { type: 'ping', ts: 1 },
      { type: 'pong', ts: 2, echoTs: 1 },
    ];
    for (const m of msgs) {
      const r = JSON.parse(JSON.stringify(m));
      expect(r).toEqual(m);
    }
  });
});
