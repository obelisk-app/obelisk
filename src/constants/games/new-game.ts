/**
 * Games: new game. Values the code in `utils/games/new-game/game-options.ts`
 * reads, kept here so every reader imports the one copy.
 */

/** The turn clocks offered, in seconds; 0 is no clock at all, which the picker words itself. */
export const TIMEOUTS: Array<{ label: string | null; seconds: number }> = [
  { label: null, seconds: 0 },
  { label: '30s', seconds: 30 },
  { label: '45s', seconds: 45 },
  { label: '2m', seconds: 120 },
  { label: '5m', seconds: 300 },
];
