/**
 * The ringtones: each one an instrument (partials, envelope, filter, reverb
 * send) playing a shared set of phrases. Pure data; `ringtone-synth.ts` turns
 * it into Web Audio nodes and `sound.ts` decides when to play.
 */
import type { NotificationRingtone } from '@/services/preferences/preferences';

export type NotificationSoundKind = 'mention' | 'reply' | 'dm' | 'ring' | 'ringback';

export type RingtoneId = NotificationRingtone;

export const RINGTONES: ReadonlyArray<RingtoneId> = ['crystal', 'marimba', 'aurora', 'bubble'];
export const DEFAULT_RINGTONE: RingtoneId = 'crystal';

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

export interface Ringtone {
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
  // Call-and-answer: the arpeggio up, then the top two notes again, so it
  // reads as "phone" rather than as another message chime.
  ring: [
    [0, 0, 0.8], [4, 0.12, 0.85], [7, 0.24, 0.9], [12, 0.36, 1],
    [7, 0.72, 0.85], [12, 0.84, 1],
  ],
  ringback: [[0, 0, 0.45], [7, 0.3, 0.4]],
};

/** Seconds between the starts of two ring phrases. */
export const RING_PERIOD_MS: Record<'ring' | 'ringback', number> = { ring: 2400, ringback: 3000 };

export const RINGTONE_DEFS: Record<RingtoneId, Ringtone> = {
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
