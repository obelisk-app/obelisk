/**
 * Synthesized notification ringtones - no audio assets shipped.
 *
 * Each ringtone is a small instrument (a set of partials with its own
 * envelope, optional pitch glide, filter and reverb amount) plus three
 * phrases so the ear can tell the events apart without looking:
 *
 *   • `mention` - rising two-note motif (someone said `@you`)
 *   • `reply`   - falling two-note motif (someone answered you)
 *   • `dm`      - four-note arpeggio (a private message)
 *   • `ring`    - a longer rising-and-answering figure, looped while a DM
 *                 call is ringing you (`startRingLoop`)
 *   • `ringback` -  two quiet notes, looped for the caller while it rings
 *
 * The signal path is voice → master gain → compressor → out, with a send
 * to a convolver whose impulse is generated noise (a short "room"), so the
 * tones ring out instead of stopping dead.
 *
 * Browsers refuse to start an `AudioContext` outside a user gesture, so the
 * context is primed on the first pointer/key event. A chime that fires
 * before any gesture is simply lost - that is the platform's rule, not ours.
 *
 * Bursts are collapsed: a reconnect that delivers five cards at once plays
 * one chime, not five (see {@link SOUND_MIN_GAP_MS}).
 */

import { getPreferences } from '@/services/preferences/preferences';
import {
  DEFAULT_RINGTONE,
  RING_PERIOD_MS,
  RINGTONES,
  type NotificationSoundKind,
  type RingtoneId,
} from '@/constants/notifications/ringtone-defs';
import { resetReverb, schedule } from './ringtone-synth';
import { SOUND_MIN_GAP_MS, RESUME_DEADLINE_MS } from '@/constants/notifications/sound';

export {
  DEFAULT_RINGTONE,
  RING_PERIOD_MS,
  RINGTONES,
  type NotificationSoundKind,
  type RingtoneId,
} from '@/constants/notifications/ringtone-defs';

let ctx: AudioContext | null = null;
let lastPlayedAt = 0;

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

export type PlayResult = 'played' | 'blocked' | 'unavailable';

function hasStickyActivation(): boolean | null {
  if (typeof navigator === 'undefined') return null;
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : null;
}

/**
 * Schedule the chime now, or report that the browser won't allow it.
 *
 * Audio plays fine in a background tab - but only once the page has had a
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

/** Settings preview - a user gesture, so it bypasses the burst throttle. */
export function previewRingtone(ringtone: RingtoneId, kind: NotificationSoundKind = 'mention'): boolean {
  try {
    return play(kind, ringtone) === 'played';
  } catch {
    return false;
  }
}

/**
 * Loop a call sound until the returned stop function is called. Bypasses the
 * burst throttle (a ring is one sound repeated on purpose) and uses the
 * user's ringtone, so a call sounds like the rest of their notifications.
 *
 * Returns the first attempt's result too: `'blocked'` means the page has had
 * no gesture yet and nothing will be heard, so the caller should lean on the
 * OS notification. The loop keeps trying anyway - the first click on the
 * page unblocks it mid-ring.
 */
export function startRingLoop(kind: 'ring' | 'ringback'): { stop: () => void; first: PlayResult } {
  const attempt = (): PlayResult => {
    try {
      return play(kind, currentRingtone());
    } catch {
      return 'unavailable';
    }
  };
  const first = attempt();
  const timer = setInterval(attempt, RING_PERIOD_MS[kind]);
  let stopped = false;
  return {
    first,
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
    },
  };
}

/** Test seam - forget the throttle and the cached context. */
export function __resetNotificationSoundForTests(): void {
  ctx = null;
  resetReverb();
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
