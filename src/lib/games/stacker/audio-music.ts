/**
 * Stacker's music: a shuffled playlist of recorded tracks, with a generative
 * synth bed as the fallback when a file cannot load or autoplay is refused.
 */
import { graph } from './audio-graph';

let musicTimer: ReturnType<typeof setInterval> | null = null;
let musicStep = 0;

/**
 * The soundtrack.
 *
 * From TETRA (github.com/soyezequiel/tetris-para-luna-negra), a La Crypta
 * hackathon project. That repo marks its royalty-free tracks with an `ncc`
 * filename prefix - see `ROYALTY_FREE_PREFIX` in its `src/audio/music.ts`  - 
 * and this is one of them, generated with Suno. Credited in the UI and in
 * docs/games.md.
 *
 * If it will not load or play, the synthesized bed below takes over, so the
 * game is never silent because of a missing file or an autoplay policy.
 */
export const MUSIC_SOURCE = 'https://github.com/soyezequiel/tetris-para-luna-negra';
export const MUSIC_AUTHOR = 'soyezequiel';

/**
 * The playlist - the `ncc`-prefixed (royalty-free) tracks from TETRA.
 *
 * It just plays: no picker, no per-track controls. One track ends and the
 * next starts, shuffled once per session so a match does not always open on
 * the same song.
 */
export const MUSIC_TRACKS: Array<{ url: string; title: string }> = [
  { url: '/games/stacker/retro-game-ncc.mp3', title: 'Retro Game' }, // i18n-exempt: song title
  { url: '/games/stacker/digital-circus-ncc.mp3', title: 'Digital Circus' }, // i18n-exempt: song title
  { url: '/games/stacker/shoebody-bop-ncc.mp3', title: 'Shoebody Bop' }, // i18n-exempt: song title
];

/** Who made the music and where it lives. The table adds the licence note in the reader's language. */
export const MUSIC_CREDIT = {
  author: MUSIC_AUTHOR,
  source: MUSIC_SOURCE,
};

let trackEl: HTMLAudioElement | null = null;
let trackFailed = false;
let order: number[] = [];
let orderPos = 0;
let onTrackChange: ((title: string) => void) | null = null;

function ensureOrder(): void {
  if (order.length === MUSIC_TRACKS.length) return;
  order = MUSIC_TRACKS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  orderPos = 0;
}

/** Which track is playing, for the credit line. */
export function currentTrack(): { url: string; title: string } {
  ensureOrder();
  return MUSIC_TRACKS[order[orderPos % order.length]];
}

/** Lets the credit line follow the music without the player having to care. */
export function setTrackListener(listener: ((title: string) => void) | null): void {
  onTrackChange = listener;
}

/**
 * A generative bed rather than a loop: a bass line under a shifting arpeggio,
 * stepped on a timer. It never repeats exactly, which wears better over a long
 * match than an eight-bar loop, and it costs nothing to ship.
 *
 * Swap this function's body for an <audio> element if you bring your own
 * track - nothing else in the game touches music.
 */
const SCALE = [0, 3, 5, 7, 10]; // minor pentatonic: hard to make sound wrong
const ROOTS = [110, 110, 98, 87.31, 98]; // A, A, G, F, G

/**
 * Start the soundtrack, falling back to the synth bed if it cannot play.
 *
 * The <audio> element is deliberately not routed through the AudioContext:
 * that would need CORS-clean decoding for no benefit here, and volume and
 * muting are simpler on the element itself.
 */
export function startMusic(): void {
  if (!trackFailed && typeof Audio !== 'undefined') {
    if (!trackEl) {
      trackEl = new Audio(currentTrack().url);
      trackEl.volume = 0.35;
      // One track ends, the next begins. Nobody has to choose anything.
      trackEl.addEventListener('ended', advance);
      trackEl.addEventListener('error', () => {
        // Missing or undecodable: move on, and fall back to the synth only
        // once the whole playlist has failed.
        if (orderPos + 1 < MUSIC_TRACKS.length) {
          advance();
          return;
        }
        trackFailed = true;
        trackEl = null;
        startSynthMusic();
      });
    }
    void trackEl.play().catch(() => {
      // Autoplay refused, or the file will not play. Same answer.
      trackFailed = true;
      trackEl = null;
      startSynthMusic();
    });
    onTrackChange?.(currentTrack().title);
    return;
  }
  startSynthMusic();
}

function advance(): void {
  ensureOrder();
  orderPos = (orderPos + 1) % order.length;
  if (trackEl) {
    trackEl.src = currentTrack().url;
    trackEl.currentTime = 0;
    void trackEl.play().catch(() => { /* the error handler moves us along */ });
  }
  onTrackChange?.(currentTrack().title);
}

export function stopMusic(): void {
  if (trackEl) {
    trackEl.pause();
    trackEl.currentTime = 0;
  }
  stopSynthMusic();
}

function startSynthMusic(): void {
  if (!graph.ctx || !graph.musicGain || musicTimer) return;
  const stepMs = 150;

  musicTimer = setInterval(() => {
    if (!graph.ctx || !graph.musicGain) return;
    const t = graph.ctx.currentTime;
    const bar = Math.floor(musicStep / 16) % ROOTS.length;
    const root = ROOTS[bar];

    // Bass on the downbeat and the off-beat.
    if (musicStep % 4 === 0) {
      const osc = graph.ctx.createOscillator();
      const env = graph.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = root / 2;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.5, t + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(env);
      env.connect(graph.musicGain);
      osc.start(t);
      osc.stop(t + 0.3);
    }

    // Arpeggio, wandering up and down the scale.
    const degree = SCALE[(musicStep * 3) % SCALE.length];
    const octave = musicStep % 8 < 4 ? 2 : 4;
    const osc = graph.ctx.createOscillator();
    const env = graph.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = root * octave * Math.pow(2, degree / 12);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.12, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(env);
    env.connect(graph.musicGain);
    osc.start(t);
    osc.stop(t + 0.16);

    musicStep += 1;
  }, stepMs);
}

function stopSynthMusic(): void {
  if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

/** Lift the music a little when things get tense. */
export function setMusicIntensity(danger: number): void {
  const lift = Math.min(1, Math.max(0, danger));
  if (trackEl) trackEl.volume = 0.3 + lift * 0.2;
  if (!graph.ctx || !graph.musicGain) return;
  graph.musicGain.gain.setTargetAtTime(0.12 + lift * 0.12, graph.ctx.currentTime, 0.3);
}

/** Mute or unmute the recorded track (the synth bed follows the master gain). */
export function muteTrack(muted: boolean): void {
  if (trackEl) trackEl.muted = muted;
}

/** For teardown: stop, forget the track and its failure, restart the synth at bar one. */
export function resetMusic(): void {
  stopMusic();
  trackEl = null;
  trackFailed = false;
  musicStep = 0;
}
