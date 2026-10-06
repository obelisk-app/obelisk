/**
 * Stacker's Web Audio graph: one context, a master gain, and the music and
 * effects buses under it. Created lazily on the first user gesture, because
 * browsers refuse to start a context otherwise. Shared by the effects
 * (`audio-sfx.ts`) and the music (`audio-music.ts`).
 */

export const graph: {
  ctx: AudioContext | null;
  master: GainNode | null;
  musicGain: GainNode | null;
  sfxGain: GainNode | null;
} = { ctx: null, master: null, musicGain: null, sfxGain: null };

/** Start (or resume) the audio graph. Must be called from a user gesture. */
export function ensureAudio(): boolean {
  if (typeof window === 'undefined') return false;
  const Ctor = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return false;

  if (!graph.ctx) {
    graph.ctx = new Ctor();
    graph.master = graph.ctx.createGain();
    graph.master.gain.value = 0.5;
    graph.master.connect(graph.ctx.destination);

    graph.musicGain = graph.ctx.createGain();
    graph.musicGain.gain.value = 0.16;
    graph.musicGain.connect(graph.master);

    graph.sfxGain = graph.ctx.createGain();
    graph.sfxGain.gain.value = 0.7;
    graph.sfxGain.connect(graph.master);
  }
  if (graph.ctx.state === 'suspended') void graph.ctx.resume();
  return true;
}
