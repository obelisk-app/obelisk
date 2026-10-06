/**
 * Stacker's sound.
 *
 * **Effects** are synthesized by Web Audio at runtime - no files, no licensing
 * surface, a couple of kilobytes of code instead of megabytes of assets. It
 * suits the game too: sounds are consequences of engine events, so they fire
 * exactly where those events happen and are pitched by how big they were.
 *
 * **Music** is a recorded track (see `MUSIC_CREDIT`), with a generative synth
 * bed as the fallback when it cannot load or autoplay is refused. The game is
 * never silent for want of a file.
 *
 * The audio context is created lazily on the first user gesture, because
 * browsers refuse to start one otherwise.
 */

import { graph } from './audio-graph';
import { muteTrack, resetMusic } from './audio-music';

export { ensureAudio } from './audio-graph';
export { playClear, playSfx, type Sfx } from './audio-sfx';
export {
  MUSIC_AUTHOR,
  MUSIC_CREDIT,
  MUSIC_SOURCE,
  MUSIC_TRACKS,
  currentTrack,
  setMusicIntensity,
  setTrackListener,
  startMusic,
  stopMusic,
} from './audio-music';

const STORAGE_KEY = 'obelisk-dex/stacker/audio';

export interface AudioPrefs {
  muted: boolean;
  music: boolean;
}

export function loadPrefs(): AudioPrefs {
  if (typeof localStorage === 'undefined') return { muted: false, music: true };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { muted: false, music: true };
    const parsed = JSON.parse(raw) as Partial<AudioPrefs>;
    return { muted: parsed.muted === true, music: parsed.music !== false };
  } catch {
    return { muted: false, music: true };
  }
}

export function savePrefs(prefs: AudioPrefs): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* a full quota is not worth breaking the game over */
  }
}

export function setMuted(muted: boolean): void {
  muteTrack(muted);
  if (!graph.master || !graph.ctx) return;
  graph.master.gain.setTargetAtTime(muted ? 0 : 0.5, graph.ctx.currentTime, 0.02);
}

/** For tests and teardown. */
export function disposeAudio(): void {
  resetMusic();
  if (graph.ctx) void graph.ctx.close().catch(() => {});
  graph.ctx = null;
  graph.master = null;
  graph.musicGain = null;
  graph.sfxGain = null;
}
