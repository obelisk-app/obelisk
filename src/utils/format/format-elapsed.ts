/**
 * A duration in ms as `m:ss`, or `h:mm:ss` once it passes an hour. Never
 * negative, and `0:00` for anything that is not a finite number (an audio
 * element reports `NaN` before metadata and `Infinity` for a live WebM).
 *
 * The voice-note recorder and the voice player each wrapped this in a
 * seconds-taking helper of their own (`formatDuration`, `formatAudioTime`);
 * they call it directly now.
 */
export function formatElapsed(ms: number): string {
  const s = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
