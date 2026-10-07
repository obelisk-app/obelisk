/** Seat colours, matching upstream's player palette. */
export const VESTA_PLAYER_COLORS = ['#e07b30', '#3498db', '#2ecc71', '#e74c3c'];

export const RESOURCE_COLORS: Record<string, string> = {
  brick: '#b45309',
  lumber: '#15803d',
  wool: '#a8a29e',
  grain: '#ca8a04',
  ore: '#57534e',
  desert: '#d6bd8a',
};

export const TILE_EMOJI: Record<string, string> = {
  brick: '🧱',
  lumber: '🪵',
  wool: '🐑',
  grain: '🌾',
  ore: '🪨',
  desert: '🌵',
};

export const DOT_COUNTS: Record<number, number> = {
  2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1,
};
