/**
 * Ringtone synthesis: schedules one phrase of a ringtone on an AudioContext.
 * The signal path is voice -> filter -> master -> compressor -> out, with a
 * send to a shared convolver "room" whose impulse is generated noise.
 */
import {
  DEFAULT_RINGTONE,
  RINGTONE_DEFS,
  type NotificationSoundKind,
  type RingtoneId,
} from './ringtone-defs';

let reverb: { ctx: AudioContext; input: AudioNode } | null = null;

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

export function schedule(ac: AudioContext, id: RingtoneId, kind: NotificationSoundKind): void {
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

/** Test seam: forget the cached room so a fresh context builds its own. */
export function resetReverb(): void {
  reverb = null;
}
