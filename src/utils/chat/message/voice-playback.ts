/** The speed the voice player's rate button steps to next: 1, 1.5, 2, then back to 1. */
export function nextPlaybackRate(rate: number): number {
  return rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
}
