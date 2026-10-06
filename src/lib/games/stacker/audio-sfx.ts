/**
 * Stacker's sound effects, synthesized at runtime: each one a consequence of
 * an engine event, pitched by how big it was.
 */
import { graph } from './audio-graph';

export type Sfx =
  | 'move' | 'rotate' | 'lock' | 'hold' | 'drop'
  | 'clear1' | 'clear2' | 'clear3' | 'clear4'
  | 'spin' | 'combo' | 'garbage' | 'danger' | 'topout' | 'win';

function blip(opts: {
  freq: number;
  to?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}): void {
  if (!graph.ctx || !graph.sfxGain) return;
  const t0 = graph.ctx.currentTime + (opts.delay ?? 0);
  const osc = graph.ctx.createOscillator();
  const env = graph.ctx.createGain();
  osc.type = opts.type ?? 'square';
  osc.frequency.setValueAtTime(opts.freq, t0);
  if (opts.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + opts.duration);
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(opts.gain ?? 0.3, t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.duration);
  osc.connect(env);
  env.connect(graph.sfxGain);
  osc.start(t0);
  osc.stop(t0 + opts.duration + 0.02);
}

/** Filtered noise - thuds, garbage, impacts. */
function noise(opts: { duration: number; gain?: number; freq?: number; delay?: number }): void {
  if (!graph.ctx || !graph.sfxGain) return;
  const t0 = graph.ctx.currentTime + (opts.delay ?? 0);
  const frames = Math.floor(graph.ctx.sampleRate * opts.duration);
  const buffer = graph.ctx.createBuffer(1, Math.max(1, frames), graph.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // Decaying noise, so it reads as an impact rather than a hiss.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const src = graph.ctx.createBufferSource();
  src.buffer = buffer;
  const filter = graph.ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = opts.freq ?? 800;
  const env = graph.ctx.createGain();
  env.gain.value = opts.gain ?? 0.25;
  src.connect(filter);
  filter.connect(env);
  env.connect(graph.sfxGain);
  src.start(t0);
}

/** Play one of the game's sounds. Silent (and harmless) before `ensureAudio`. */
export function playSfx(sfx: Sfx): void {
  if (!graph.ctx || !graph.sfxGain) return;

  switch (sfx) {
    case 'move':
      blip({ freq: 220, duration: 0.03, type: 'square', gain: 0.08 });
      break;
    case 'rotate':
      blip({ freq: 330, to: 420, duration: 0.05, type: 'triangle', gain: 0.12 });
      break;
    case 'hold':
      blip({ freq: 520, to: 380, duration: 0.08, type: 'triangle', gain: 0.14 });
      break;
    case 'drop':
      blip({ freq: 180, to: 60, duration: 0.09, type: 'sawtooth', gain: 0.16 });
      noise({ duration: 0.06, gain: 0.18, freq: 500 });
      break;
    case 'lock':
      noise({ duration: 0.05, gain: 0.14, freq: 400 });
      break;
    // Clears climb in pitch and length with the line count, so a quad
    // announces itself without needing a caption.
    case 'clear1':
      blip({ freq: 523, to: 784, duration: 0.16, type: 'triangle', gain: 0.22 });
      break;
    case 'clear2':
      blip({ freq: 523, duration: 0.1, type: 'square', gain: 0.2 });
      blip({ freq: 659, duration: 0.16, type: 'square', gain: 0.2, delay: 0.07 });
      break;
    case 'clear3':
      blip({ freq: 523, duration: 0.09, type: 'square', gain: 0.2 });
      blip({ freq: 659, duration: 0.09, type: 'square', gain: 0.2, delay: 0.07 });
      blip({ freq: 784, duration: 0.2, type: 'square', gain: 0.22, delay: 0.14 });
      break;
    case 'clear4':
      // The big one: a rising arpeggio with a shimmer on top.
      [523, 659, 784, 1047].forEach((f, i) => {
        blip({ freq: f, duration: 0.22, type: 'square', gain: 0.22, delay: i * 0.055 });
      });
      blip({ freq: 2093, duration: 0.5, type: 'sine', gain: 0.12, delay: 0.2 });
      break;
    case 'spin':
      blip({ freq: 880, to: 1320, duration: 0.18, type: 'sine', gain: 0.2 });
      blip({ freq: 660, to: 990, duration: 0.22, type: 'triangle', gain: 0.14, delay: 0.03 });
      break;
    case 'combo':
      blip({ freq: 1200, to: 1800, duration: 0.1, type: 'sine', gain: 0.16 });
      break;
    case 'garbage':
      noise({ duration: 0.22, gain: 0.3, freq: 260 });
      blip({ freq: 90, to: 55, duration: 0.24, type: 'sawtooth', gain: 0.2 });
      break;
    case 'danger':
      blip({ freq: 160, to: 120, duration: 0.3, type: 'sawtooth', gain: 0.1 });
      break;
    case 'topout':
      [440, 370, 294, 220].forEach((f, i) => {
        blip({ freq: f, duration: 0.35, type: 'sawtooth', gain: 0.2, delay: i * 0.12 });
      });
      noise({ duration: 0.7, gain: 0.2, freq: 300, delay: 0.1 });
      break;
    case 'win':
      [523, 659, 784, 1047, 1319].forEach((f, i) => {
        blip({ freq: f, duration: 0.4, type: 'triangle', gain: 0.24, delay: i * 0.1 });
      });
      break;
  }
}

/** The clear sound for a given line count and spin, in one call. */
export function playClear(lines: number, spin: boolean, combo: number): void {
  if (spin) playSfx('spin');
  else if (lines >= 4) playSfx('clear4');
  else if (lines === 3) playSfx('clear3');
  else if (lines === 2) playSfx('clear2');
  else if (lines === 1) playSfx('clear1');
  if (combo >= 2) playSfx('combo');
}
