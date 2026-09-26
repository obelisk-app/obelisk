/**
 * Synthesized notification ringtones — no audio assets shipped.
 *
 * Each ringtone is a small instrument (a set of partials with its own
 * envelope, optional pitch glide, filter and reverb amount) plus three
 * phrases so the ear can tell the events apart without looking:
 *
 *   • `mention` — rising two-note motif (someone said `@you`)
 *   • `reply`   — falling two-note motif (someone answered you)
 *   • `dm`      — four-note arpeggio (a private message)
 *
 * The signal path is voice → master gain → compressor → out, with a send
 * to a convolver whose impulse is generated noise (a short "room"), so the
 * tones ring out instead of stopping dead.
 *
 * Browsers refuse to start an `AudioContext` outside a user gesture, so the
 * context is primed on the first pointer/key event. A chime that fires
 * before any gesture is simply lost — that is the platform's rule, not ours.
 *
 * Bursts are collapsed: a reconnect that delivers five cards at once plays
 * one chime, not five (see {@link SOUND_MIN_GAP_MS}).
 */

import { getPreferences, type NotificationRingtone } from '@/lib/preferences';

export type NotificationSoundKind = 'mention' | 'reply' | 'dm';

export type RingtoneId = NotificationRingtone;

export const RINGTONES: ReadonlyArray<RingtoneId> = ['crystal', 'marimba', 'aurora', 'bubble'];
export const DEFAULT_RINGTONE: RingtoneId = 'crystal';

/** Minimum gap between two chimes. Anything inside it is dropped. */
export const SOUND_MIN_GAP_MS = 1200;

interface Instrument {
  /** [frequency ratio, relative gain, decay multiplier] */
  readonly partials: ReadonlyArray<readonly [number, number, number]>;
  readonly wave: OscillatorType;
  /** Seconds. */
  readonly attack: number;
  /** Seconds to fall to silence, before the per-partial multiplier. */
  readonly decay: number;
  /** Peak gain per note. */
  readonly gain: number;
  /** Start the pitch this factor below and glide up (bubble). */
  readonly glideFrom?: number;
  readonly glideTime?: number;
  /** Lowpass cutoff, Hz. */
  readonly cutoff: number;
  /** Reverb send, 0..1. */
  readonly wet: number;
}

/** A phrase: [semitones above the ringtone's root, onset seconds, velocity 0..1]. */
type Phrase = ReadonlyArray<readonly [number, number, number]>;

interface Ringtone {
  readonly root: number;
  readonly instrument: Instrument;
  readonly phrases: Record<NotificationSoundKind, Phrase>;
}

// Phrases are shared: major-pentatonic shapes that sound consonant on any
// instrument. mention rises a fifth, reply falls a major third, dm arpeggiates.
const PHRASES: Record<NotificationSoundKind, Phrase> = {
  mention: [[0, 0, 0.8], [7, 0.11, 1]],
  reply: [[7, 0, 0.9], [4, 0.12, 0.8]],
  dm: [[0, 0, 0.7], [4, 0.085, 0.75], [7, 0.17, 0.85], [12, 0.255, 1]],
};

const RINGTONE_DEFS: Record<RingtoneId, Ringtone> = {
  // Glassy bell: slightly inharmonic upper partials, long shimmering tail.
  crystal: {
    root: 659.25, // E5
    instrument: {
      partials: [[1, 1, 1], [2.01, 0.32, 0.55], [3.02, 0.14, 0.35], [4.23, 0.07, 0.22], [5.4, 0.03, 0.15]],
      wave: 'sine',
      attack: 0.004,
      decay: 1.5,
      gain: 0.16,
      cutoff: 7000,
      wet: 0.38,
    },
    phrases: PHRASES,
  },
  // Wooden bar: strong 4th partial that dies fast, short warm body.
  marimba: {
    root: 523.25, // C5
    instrument: {
      partials: [[1, 1, 1], [3.93, 0.3, 0.18], [9.2, 0.06, 0.08]],
      wave: 'sine',
      attack: 0.003,
      decay: 0.55,
      gain: 0.24,
      cutoff: 5000,
      wet: 0.14,
    },
    phrases: PHRASES,
  },
  // Soft pad: detuned pair through a darker filter, slow bloom.
  aurora: {
    root: 440, // A4
    instrument: {
      partials: [[1, 1, 1], [1.005, 0.8, 1], [2, 0.25, 0.7], [0.5, 0.2, 1]],
      wave: 'triangle',
      attack: 0.045,
      decay: 1.3,
      gain: 0.1,
      cutoff: 2600,
      wet: 0.5,
    },
    phrases: PHRASES,
  },
  // Water drop: pitch glides up into the note, very short.
  bubble: {
    root: 880, // A5
    instrument: {
      partials: [[1, 1, 1], [2, 0.12, 0.5]],
      wave: 'sine',
      attack: 0.004,
      decay: 0.22,
      gain: 0.26,
      glideFrom: 0.55,
      glideTime: 0.05,
      cutoff: 6000,
      wet: 0.18,
    },
    phrases: PHRASES,
  },
};

let ctx: AudioContext | null = null;
let lastPlayedAt = 0;
let reverb: { ctx: AudioContext; input: AudioNode } | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/** Shared "room": convolver with a generated decaying-noise impulse. */
function getReverb(ac: AudioContext, out: AudioNode): AudioNode | null {
  if (reverb?.ctx === ac) return reverb.input;
  if (typeof ac.createConvolver !== 'function' || typeof ac.createBuffer !== 'function') return null;
  try {
    const seconds = 1.6;
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
    }
    const conv = ac.createConvolver();
    conv.buffer = buf;
    conv.connect(out);
    reverb = { ctx: ac, input: conv };
    return conv;
  } catch {
    return null;
  }
}

function schedule(ac: AudioContext, id: RingtoneId, kind: NotificationSoundKind): void {
  const { root, instrument: ins, phrases } = RINGTONE_DEFS[id] ?? RINGTONE_DEFS[DEFAULT_RINGTONE];
  const start = ac.currentTime + 0.015;

  // voice → filter → master → compressor → out; filter → wet → reverb → master
  const master = ac.createGain();
  master.gain.value = 1;
  let out: AudioNode = ac.destination;
  if (typeof ac.createDynamicsCompressor === 'function') {
    const comp = ac.createDynamicsCompressor();
    comp.connect(ac.destination);
    out = comp;
  }
  master.connect(out);
  const filter = typeof ac.createBiquadFilter === 'function' ? ac.createBiquadFilter() : null;
  const bus: AudioNode = filter ?? master;
  if (filter) {
    filter.type = 'lowpass';
    filter.frequency.value = ins.cutoff;
    filter.connect(master);
  }
  const room = ins.wet > 0 ? getReverb(ac, master) : null;
  if (room) {
    const send = ac.createGain();
    send.gain.value = ins.wet;
    bus.connect(send);
    send.connect(room);
  }

  for (const [semis, at, vel] of phrases[kind]) {
    const freq = root * Math.pow(2, semis / 12);
    const t0 = start + at;
    for (const [ratio, pGain, decayMul] of ins.partials) {
      const osc = ac.createOscillator();
      const env = ac.createGain();
      const f = freq * ratio;
      const peak = Math.max(0.0002, ins.gain * pGain * vel);
      const end = t0 + ins.attack + ins.decay * decayMul;
      osc.type = ins.wave;
      if (ins.glideFrom) {
        osc.frequency.setValueAtTime(f * ins.glideFrom, t0);
        osc.frequency.exponentialRampToValueAtTime(f, t0 + (ins.glideTime ?? 0.05));
      } else {
        osc.frequency.setValueAtTime(f, t0);
      }
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(peak, t0 + ins.attack);
      env.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(env).connect(bus);
      osc.start(t0);
      osc.stop(end + 0.05);
    }
  }
}

/** How long a suspended context gets to resume before the chime is dropped. */
export const RESUME_DEADLINE_MS = 400;

export type PlayResult = 'played' | 'blocked' | 'unavailable';

function hasStickyActivation(): boolean | null {
  if (typeof navigator === 'undefined') return null;
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : null;
}

/**
 * Schedule the chime now, or report that the browser won't allow it.
 *
 * Audio plays fine in a background tab — but only once the page has had a
 * user gesture (click/keypress) since it loaded; before that the context
 * stays suspended. The old code queued the chime on `resume()`, which only
 * settles at the NEXT click, so a ping heard while you were elsewhere
 * chimed seconds later when you clicked the relay tile. Now: if the page
 * has sticky activation, resume and play immediately (works in background
 * tabs); if it doesn't, return `'blocked'` synchronously so the caller can
 * fall back to a system notification, which makes sound without a gesture.
 * A resume that hasn't settled within {@link RESUME_DEADLINE_MS} is dropped
 * rather than played late.
 */
function play(kind: NotificationSoundKind, ringtone: RingtoneId): PlayResult {
  const ac = getCtx();
  if (!ac) return 'unavailable';
  if (ac.state === 'running') {
    schedule(ac, ringtone, kind);
    return 'played';
  }
  // No gesture yet this page load: it will not resume, don't pretend.
  // (Browsers without the userActivation API: assume blocked, so the
  // system-notification fallback still gets a chance to make noise.)
  if (hasStickyActivation() !== true) return 'blocked';
  let settled = false;
  const deadline = setTimeout(() => { settled = true; }, RESUME_DEADLINE_MS);
  ac.resume().then(() => {
    if (settled || ac.state !== 'running') return;
    settled = true;
    clearTimeout(deadline);
    schedule(ac, ringtone, kind);
  }).catch(() => {});
  return 'played';
}

export function currentRingtone(): RingtoneId {
  const id = getPreferences().notificationRingtone;
  return RINGTONES.includes(id) ? id : DEFAULT_RINGTONE;
}

/**
 * Play the chime for `kind` in the user's ringtone. Returns `true` when a
 * chime was scheduled, `false` when it was throttled or audio is
 * unavailable. Never throws.
 */
export function playNotificationSound(kind: NotificationSoundKind, now = Date.now()): PlayResult {
  if (now - lastPlayedAt < SOUND_MIN_GAP_MS) return 'played'; // collapsed into the chime just played
  try {
    const result = play(kind, currentRingtone());
    if (result === 'played') lastPlayedAt = now;
    return result;
  } catch {
    return 'unavailable';
  }
}

/** Settings preview — a user gesture, so it bypasses the burst throttle. */
export function previewRingtone(ringtone: RingtoneId, kind: NotificationSoundKind = 'mention'): boolean {
  try {
    return play(kind, ringtone) === 'played';
  } catch {
    return false;
  }
}

/** Test seam — forget the throttle and the cached context. */
export function __resetNotificationSoundForTests(): void {
  ctx = null;
  reverb = null;
  lastPlayedAt = 0;
}

const PRIME_EVENTS = ['pointerdown', 'keydown', 'touchend', 'click'] as const;

if (typeof window !== 'undefined') {
  const prime = () => {
    const ac = getCtx();
    if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
    if (ac && ac.state !== 'suspended') {
      for (const type of PRIME_EVENTS) window.removeEventListener(type, prime);
    }
  };
  for (const type of PRIME_EVENTS) window.addEventListener(type, prime, { passive: true });
}
