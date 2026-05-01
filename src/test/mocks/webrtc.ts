/**
 * Test fakes for the slice of WebRTC the voice subsystem actually uses.
 *
 * Goals:
 *  - Model RTCPeerConnection well enough that two `FakePc` instances can
 *    perform a full perfect-negotiation handshake against each other.
 *  - Encode the m-line list inside the fake SDP so we can detect order
 *    drift across renegotiations (the real-browser bug we hit).
 *  - Provide RTCRtpSender.getParameters / setParameters / replaceTrack so
 *    encoder-cap tests can inspect what the production code applied.
 *  - Provide MediaStreamTrack.applyConstraints so quality-change tests
 *    don't blow up.
 *
 * Non-goals: actual media transport, ICE state machine fidelity, codec
 * negotiation. We're testing OUR protocol code, not WebRTC.
 *
 * Install via `installWebRtcMocks()` in a test's `beforeEach` — it patches
 * `globalThis.RTCPeerConnection`, `MediaStream`, and the no-op constructors.
 */

type Listener = (ev: unknown) => void;

class TinyEventTarget {
  private listeners = new Map<string, Set<Listener>>();
  addEventListener(type: string, fn: Listener): void {
    let set = this.listeners.get(type);
    if (!set) { set = new Set(); this.listeners.set(type, set); }
    set.add(fn);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners.get(type)?.delete(fn);
  }
  dispatchEvent(type: string, payload: unknown = {}): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try { fn(payload); } catch { /* swallow — production code does similar */ }
    }
  }
}

let trackIdSeq = 1;

export class FakeMediaStreamTrack extends TinyEventTarget {
  readonly id: string = `track-${trackIdSeq++}`;
  enabled = true;
  readyState: 'live' | 'ended' = 'live';
  readonly kind: 'audio' | 'video';
  /** Last constraints applied via applyConstraints. */
  appliedConstraints: MediaTrackConstraints | null = null;
  onended: (() => void) | null = null;

  constructor(kind: 'audio' | 'video') {
    super();
    this.kind = kind;
  }

  stop(): void {
    this.readyState = 'ended';
    this.onended?.();
    this.dispatchEvent('ended');
  }

  async applyConstraints(c: MediaTrackConstraints): Promise<void> {
    this.appliedConstraints = c;
  }
}

export class FakeMediaStream {
  private tracks: FakeMediaStreamTrack[] = [];
  constructor(initial: FakeMediaStreamTrack[] = []) {
    this.tracks = [...initial];
  }
  getTracks(): FakeMediaStreamTrack[] { return [...this.tracks]; }
  getAudioTracks(): FakeMediaStreamTrack[] { return this.tracks.filter((t) => t.kind === 'audio'); }
  getVideoTracks(): FakeMediaStreamTrack[] { return this.tracks.filter((t) => t.kind === 'video'); }
  addTrack(t: FakeMediaStreamTrack): void { this.tracks.push(t); }
}

export interface FakeRtpEncoding {
  maxBitrate?: number;
  maxFramerate?: number;
  scaleResolutionDownBy?: number;
  priority?: string;
  networkPriority?: string;
}

export interface FakeRtpParameters {
  encodings: FakeRtpEncoding[];
  degradationPreference?: 'maintain-framerate' | 'maintain-resolution' | 'balanced';
}

export class FakeRtpSender {
  track: FakeMediaStreamTrack | null;
  /** Most recent params written via setParameters. */
  private params: FakeRtpParameters = { encodings: [{}] };
  /** Set by FakePc; tells the sender which transceiver it lives in. */
  mid: string | null = null;

  constructor(track: FakeMediaStreamTrack | null) {
    this.track = track;
  }

  async replaceTrack(t: FakeMediaStreamTrack | null): Promise<void> {
    this.track = t;
  }

  getParameters(): FakeRtpParameters {
    // Return a structured clone so prod code mutating before setParameters
    // doesn't leak back into our internal state until they call setParameters.
    return JSON.parse(JSON.stringify(this.params)) as FakeRtpParameters;
  }

  async setParameters(p: FakeRtpParameters): Promise<void> {
    this.params = JSON.parse(JSON.stringify(p)) as FakeRtpParameters;
  }

  /** Test-only inspection. */
  inspect(): FakeRtpParameters {
    return JSON.parse(JSON.stringify(this.params)) as FakeRtpParameters;
  }
}

interface FakeTransceiver {
  mid: string;
  kind: 'audio' | 'video';
  sender: FakeRtpSender;
  /** 'sendrecv' when active, 'recvonly' after removeTrack (m-line preserved). */
  direction: 'sendrecv' | 'recvonly' | 'inactive';
  /** Whether the remote is currently sending media on this m-line — set
   *  from setRemoteDescription. Drives whether ontrack should fire. */
  remoteSending: boolean;
}

interface FakeSdpPayload {
  type: 'offer' | 'answer';
  /** Ordered list of m-lines the local PC currently has. We embed this in the
   *  SDP string as a comment so the receiver can validate order stability. */
  mlines: { mid: string; kind: 'audio' | 'video'; direction: string }[];
  /** A nonce so two SDPs of the same shape are still distinguishable. */
  nonce: number;
}

let sdpNonce = 1;

function encodeSdp(payload: FakeSdpPayload): string {
  return `v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=fake-payload:${JSON.stringify(payload)}\r\n`;
}

function decodeSdp(sdp: string): FakeSdpPayload | null {
  const m = /a=fake-payload:(\{.*\})/.exec(sdp);
  if (!m) return null;
  try { return JSON.parse(m[1]) as FakeSdpPayload; } catch { return null; }
}

export class FakeRTCPeerConnection extends TinyEventTarget {
  signalingState: RTCSignalingState = 'stable';
  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  iceGatheringState: RTCIceGatheringState = 'new';
  localDescription: { type: 'offer' | 'answer'; sdp: string } | null = null;
  remoteDescription: { type: 'offer' | 'answer'; sdp: string } | null = null;

  private transceivers: FakeTransceiver[] = [];
  private midSeq = 0;
  /** Last m-line order we sent in any local description. Used to verify order
   *  stability on renegotiation (matching real Chromium's behavior). */
  private lastSentMlineOrder: string[] | null = null;
  /** Last m-line order we received from the remote. */
  private lastRemoteMlineOrder: string[] | null = null;

  // Direct-property handlers (peer.ts uses `pc.onicecandidate = ...` style).
  onnegotiationneeded: (() => void) | null = null;
  onicecandidate: ((ev: { candidate: RTCIceCandidateInit | null }) => void) | null = null;
  ontrack: ((ev: { track: FakeMediaStreamTrack; streams: FakeMediaStream[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;

  private closed = false;

  constructor(_config?: RTCConfiguration) {
    super();
  }

  // -- track management --------------------------------------------------

  addTrack(track: FakeMediaStreamTrack): FakeRtpSender {
    if (this.closed) throw new Error('PC is closed');
    // Real WebRTC: addTrack first tries to reuse an existing transceiver
    // whose kind matches and that has direction recvonly with no local
    // track. This is what prevents m-line proliferation when both sides
    // add tracks of the same kind. Match that behavior.
    const reused = this.transceivers.find(
      (t) => t.kind === track.kind && t.direction === 'recvonly' && t.sender.track === null,
    );
    if (reused) {
      reused.sender.track = track;
      reused.direction = 'sendrecv';
      queueMicrotask(() => { this.onnegotiationneeded?.(); });
      return reused.sender;
    }
    const sender = new FakeRtpSender(track);
    const mid = String(this.midSeq++);
    sender.mid = mid;
    this.transceivers.push({ mid, kind: track.kind, sender, direction: 'sendrecv', remoteSending: false });
    queueMicrotask(() => { this.onnegotiationneeded?.(); });
    return sender;
  }

  removeTrack(sender: FakeRtpSender): void {
    if (this.closed) return;
    const tx = this.transceivers.find((t) => t.sender === sender);
    if (!tx) return;
    // Real WebRTC: removeTrack sets direction to recvonly but PRESERVES the
    // m-line. Re-adding a track later may reuse it OR create a new section.
    tx.direction = 'recvonly';
    sender.track = null;
    queueMicrotask(() => { this.onnegotiationneeded?.(); });
  }

  getSenders(): FakeRtpSender[] {
    return this.transceivers.map((t) => t.sender);
  }

  getTransceivers(): readonly FakeTransceiver[] {
    return this.transceivers;
  }

  // -- SDP --------------------------------------------------------------

  async createOffer(): Promise<{ type: 'offer'; sdp: string }> {
    const m = this.makeLocal('offer');
    return { type: 'offer', sdp: m.sdp };
  }

  async createAnswer(): Promise<{ type: 'answer'; sdp: string }> {
    const m = this.makeLocal('answer');
    return { type: 'answer', sdp: m.sdp };
  }

  /**
   * peer.ts uses the implicit form `pc.setLocalDescription()` which the spec
   * says auto-creates either an offer or an answer based on signalingState.
   */
  async setLocalDescription(desc?: { type: 'offer' | 'answer' | 'rollback'; sdp?: string }): Promise<void> {
    if (this.closed) throw new Error('PC is closed');
    if (desc?.type === 'rollback') {
      this.signalingState = this.remoteDescription ? 'have-remote-offer' : 'stable';
      // Strictly speaking after rollback signalingState should match the
      // pre-offer state. Tests don't need full fidelity — settle to stable.
      this.signalingState = 'stable';
      this.localDescription = null;
      return;
    }
    const type: 'offer' | 'answer' =
      desc?.type ?? (this.signalingState === 'have-remote-offer' ? 'answer' : 'offer');
    const made = this.makeLocal(type);
    this.localDescription = made;
    this.lastSentMlineOrder = this.currentMlineOrder();
    if (type === 'offer') this.signalingState = 'have-local-offer';
    else this.signalingState = 'stable';
    // Synthesize a single end-of-candidates ICE event — production code only
    // cares that *some* candidate fires so it can publish via the transport.
    queueMicrotask(() => {
      const init = { candidate: 'fake', sdpMid: '0' };
      const cand = Object.assign(Object.create(null), init, { toJSON: () => init });
      this.onicecandidate?.({ candidate: cand as unknown as RTCIceCandidateInit });
      this.onicecandidate?.({ candidate: null });
    });
    if (this.signalingState === 'stable') this.markConnected();
  }

  async setRemoteDescription(desc: { type: 'offer' | 'answer' | 'rollback'; sdp: string }): Promise<void> {
    if (this.closed) throw new Error('PC is closed');
    if (desc.type === 'rollback') {
      this.signalingState = 'stable';
      this.remoteDescription = null;
      return;
    }
    const payload = decodeSdp(desc.sdp);
    if (!payload) throw new Error('FakePc: malformed SDP');

    // ── m-line order check (the real-browser invariant) ────────────────
    // On renegotiation, the m-line list in the new description must be a
    // (non-strict) extension of the previous one — same prefix, possibly
    // with new sections appended. Throw the same shape of error Chromium
    // raises so production code is forced to handle it.
    if (this.lastRemoteMlineOrder) {
      const prev = this.lastRemoteMlineOrder;
      const next = payload.mlines.map((m) => m.mid);
      for (let i = 0; i < prev.length; i++) {
        if (next[i] !== prev[i]) {
          throw new InvalidAccessError(
            "Failed to set remote offer sdp: The order of m-lines in subsequent offer doesn't match order from previous offer/answer.",
          );
        }
      }
    }

    this.remoteDescription = { type: desc.type, sdp: desc.sdp };
    this.lastRemoteMlineOrder = payload.mlines.map((m) => m.mid);

    // Walk the remote m-line list. For new mids: synthesize a transceiver
    // and fire ontrack. For existing mids: if the remote just started
    // sending media that they weren't sending before, fire ontrack on the
    // existing transceiver (matches real WebRTC behavior).
    for (const ml of payload.mlines) {
      const remoteIsSending = ml.direction === 'sendrecv' || ml.direction === 'sendonly';
      let tx = this.transceivers.find((t) => t.mid === ml.mid);
      if (!tx) {
        const sender = new FakeRtpSender(null);
        sender.mid = ml.mid;
        tx = { mid: ml.mid, kind: ml.kind, sender, direction: 'recvonly', remoteSending: false };
        this.transceivers.push(tx);
        const remoteMidNum = parseInt(ml.mid, 10);
        if (Number.isFinite(remoteMidNum) && remoteMidNum >= this.midSeq) {
          this.midSeq = remoteMidNum + 1;
        }
      }
      if (remoteIsSending && !tx.remoteSending) {
        const track = new FakeMediaStreamTrack(tx.kind);
        const stream = new FakeMediaStream([track]);
        queueMicrotask(() => { this.ontrack?.({ track, streams: [stream] }); });
      }
      tx.remoteSending = remoteIsSending;
    }

    if (desc.type === 'offer') this.signalingState = 'have-remote-offer';
    else this.signalingState = 'stable';

    if (this.signalingState === 'stable') this.markConnected();
  }

  async addIceCandidate(_c: RTCIceCandidateInit): Promise<void> {
    // No-op — production code only cares it doesn't throw.
  }

  // -- stats -----------------------------------------------------------

  /** Stats producer overridable per-test. */
  fakeStats: Map<string, Record<string, unknown>> = new Map();
  async getStats(): Promise<Map<string, Record<string, unknown>>> {
    return this.fakeStats;
  }

  // -- lifecycle -------------------------------------------------------

  close(): void {
    this.closed = true;
    this.signalingState = 'closed';
    this.connectionState = 'closed';
    this.onconnectionstatechange?.();
  }

  /** Test helper: simulate a transient network blip then recovery. */
  forceState(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }

  // -- internals -------------------------------------------------------

  private makeLocal(type: 'offer' | 'answer'): { type: 'offer' | 'answer'; sdp: string } {
    const payload: FakeSdpPayload = {
      type,
      nonce: sdpNonce++,
      mlines: this.transceivers.map((t) => ({ mid: t.mid, kind: t.kind, direction: t.direction })),
    };
    return { type, sdp: encodeSdp(payload) };
  }

  private currentMlineOrder(): string[] {
    return this.transceivers.map((t) => t.mid);
  }

  private markConnected(): void {
    if (this.connectionState === 'connected' || this.closed) return;
    this.connectionState = 'connected';
    this.iceConnectionState = 'connected';
    queueMicrotask(() => { this.onconnectionstatechange?.(); });
  }
}

/** Thrown by FakePc.setRemoteDescription on m-line drift — name matches the
 *  real DOMException so production code can `e.name === 'InvalidAccessError'`. */
class InvalidAccessError extends Error {
  readonly name = 'InvalidAccessError';
}

// ── installer ────────────────────────────────────────────────────────────

interface InstallHandle {
  uninstall(): void;
  /** All FakePc instances created since install — useful for `expect`s. */
  pcs(): FakeRTCPeerConnection[];
  /** Pull the FakePc instance for assertions. */
  last(): FakeRTCPeerConnection;
}

export function installWebRtcMocks(): InstallHandle {
  const created: FakeRTCPeerConnection[] = [];
  const g = globalThis as unknown as Record<string, unknown>;
  const prev = {
    RTCPeerConnection: g.RTCPeerConnection,
    MediaStream: g.MediaStream,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  g.RTCPeerConnection = function (config?: RTCConfiguration) {
    const pc = new FakeRTCPeerConnection(config);
    created.push(pc);
    return pc;
  } as unknown as typeof RTCPeerConnection;
  g.MediaStream = FakeMediaStream as unknown as typeof MediaStream;

  return {
    uninstall() {
      g.RTCPeerConnection = prev.RTCPeerConnection;
      g.MediaStream = prev.MediaStream;
    },
    pcs: () => [...created],
    last: () => created[created.length - 1],
  };
}

// ── media-devices installer ─────────────────────────────────────────────

interface MediaDevicesInstallHandle {
  uninstall(): void;
  /** Test-controllable: throw on next getUserMedia. */
  rejectNextGum(reason: { name?: string; message?: string }): void;
}

export function installMediaDevicesMocks(): MediaDevicesInstallHandle {
  let rejection: { name?: string; message?: string } | null = null;
  const g = globalThis as unknown as { navigator?: { mediaDevices?: unknown } };
  if (!g.navigator) g.navigator = {};
  const prev = g.navigator.mediaDevices;
  g.navigator.mediaDevices = {
    async getUserMedia(constraints: MediaStreamConstraints): Promise<FakeMediaStream> {
      if (rejection) {
        const err = new Error(rejection.message ?? 'denied') as Error & { name: string };
        err.name = rejection.name ?? 'NotAllowedError';
        rejection = null;
        throw err;
      }
      const tracks: FakeMediaStreamTrack[] = [];
      if (constraints.audio) tracks.push(new FakeMediaStreamTrack('audio'));
      if (constraints.video) tracks.push(new FakeMediaStreamTrack('video'));
      return new FakeMediaStream(tracks);
    },
    async getDisplayMedia(_c: MediaStreamConstraints): Promise<FakeMediaStream> {
      const v = new FakeMediaStreamTrack('video');
      const a = new FakeMediaStreamTrack('audio');
      return new FakeMediaStream([v, a]);
    },
  };
  return {
    uninstall() {
      if (g.navigator) g.navigator.mediaDevices = prev;
    },
    rejectNextGum(r) { rejection = r; },
  };
}

// ── helpers for tests ───────────────────────────────────────────────────

/** Wait for queued microtasks so negotiation handlers have run. */
export async function flushMicrotasks(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}
