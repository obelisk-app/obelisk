/**
 * RMS-based voice activity detection for the mesh voice channel.
 *
 * One detector per audio source — the local mic and each remote peer's
 * mic track. Polls at ~20 Hz; emits `speaking` transitions with a hangover
 * so normal speech pauses don't strobe the UI.
 *
 * Detectors share one AudioContext per document. Browsers cap context
 * count and need a user gesture to resume — `resumeSharedAudioContext()`
 * is called from the Join Voice click. The AnalyserNode is read-only:
 * it never connects to `destination`, so playback continues exclusively
 * through the per-peer `<audio>` elements.
 */

export interface SpeakingDetectorOptions {
  /** Normalized RMS threshold in [0,1]. Tuned against echo-cancelled speech. */
  threshold?: number;
  /** Keep `speaking` true for this long after RMS drops below threshold. */
  hangoverMs?: number;
  /** Poll interval in ms. 50 ms = 20 Hz — smooth for UI, cheap for CPU. */
  intervalMs?: number;
  /** Inject for tests. */
  audioContext?: AudioContext;
  /** Inject for tests. */
  now?: () => number;
}

export type SpeakingListener = (speaking: boolean) => void;

const DEFAULTS = {
  threshold: 0.02,
  hangoverMs: 400,
  intervalMs: 50,
};

export class SpeakingDetector {
  private readonly stream: MediaStream;
  private readonly ctx: AudioContext;
  private readonly threshold: number;
  private readonly hangoverMs: number;
  private readonly intervalMs: number;
  private readonly now: () => number;
  private listener: SpeakingListener | null;

  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Uint8Array | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastAboveAt = 0;
  private _speaking = false;
  private started = false;
  private stopped = false;

  constructor(
    stream: MediaStream,
    listener: SpeakingListener,
    opts: SpeakingDetectorOptions = {},
  ) {
    this.stream = stream;
    this.listener = listener;
    this.ctx = opts.audioContext ?? getSharedAudioContext();
    this.threshold = opts.threshold ?? DEFAULTS.threshold;
    this.hangoverMs = opts.hangoverMs ?? DEFAULTS.hangoverMs;
    this.intervalMs = opts.intervalMs ?? DEFAULTS.intervalMs;
    this.now = opts.now ?? (() => Date.now());
  }

  start(): void {
    if (this.started || this.stopped) return;
    this.started = true;

    // Some environments (Safari) reject createMediaStreamSource before the
    // context has resumed. Wrap so an early start doesn't tear down the call.
    try {
      this.source = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.2;
      this.source.connect(this.analyser);
      this.buf = new Uint8Array(this.analyser.fftSize);
    } catch (err) {
      console.warn('[speaking-detector] failed to attach analyser:', err);
      return;
    }

    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    try { this.source?.disconnect(); } catch {}
    try { this.analyser?.disconnect(); } catch {}
    this.source = null;
    this.analyser = null;
    this.buf = null;
    this.listener = null;
  }

  get speaking(): boolean {
    return this._speaking;
  }

  private tick(): void {
    if (!this.analyser || !this.buf || !this.listener) return;
    this.analyser.getByteTimeDomainData(this.buf as unknown as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) {
      const v = (this.buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.buf.length);
    const t = this.now();
    if (rms > this.threshold) this.lastAboveAt = t;
    const speaking = rms > this.threshold || (t - this.lastAboveAt) < this.hangoverMs;
    if (speaking !== this._speaking) {
      this._speaking = speaking;
      this.listener(speaking);
    }
  }
}

// ── Shared AudioContext ──────────────────────────────────────────────
//
// Browsers create AudioContexts in `suspended` state until a user gesture
// resumes them. The Join Voice click is that gesture — call
// `resumeSharedAudioContext()` from there so the analysers in detectors
// (and any future GainNode routing) start producing data.

let sharedCtx: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext {
  if (sharedCtx) return sharedCtx;
  const Ctor: typeof AudioContext | undefined =
    typeof window !== 'undefined'
      ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
  if (!Ctor) throw new Error('AudioContext is not supported in this environment');
  sharedCtx = new Ctor();
  return sharedCtx;
}

export async function resumeSharedAudioContext(): Promise<void> {
  try {
    const ctx = getSharedAudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
  } catch (err) {
    console.warn('[speaking-detector] failed to resume AudioContext:', err);
  }
}

/** Test-only: reset the shared context reference so each test starts clean. */
export function __resetSharedAudioContextForTests(): void {
  sharedCtx = null;
}
