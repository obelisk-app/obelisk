import { formatElapsed } from '@/utils/format/format-elapsed';

/**
 * `m:ss` for the voice player (the shared `formatElapsed` clock); anything
 * non-finite or negative reads `0:00`.
 */
export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  return formatElapsed(seconds * 1000);
}

/** Bar heights (px) of the decorative waveform the voice player draws. */
export const VOICE_WAVEFORM = [10, 18, 13, 25, 20, 12, 28, 17, 23, 14, 30, 20, 12, 24, 17, 28, 15, 22, 30, 18, 11, 25, 16, 21, 13, 27, 19, 10] as const;

/** The speed the playback-rate button steps to next: 1, 1.5, 2, then back to 1. */
export function nextPlaybackRate(rate: number): number {
  return rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
}
