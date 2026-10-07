/**
 * Games: vesta. Values the code in `utils/games/vesta/resources.ts`,
 * `utils/games/vesta/vesta-trade.ts` reads, kept here so every reader imports
 * the one copy.
 */

import type { TradeResource } from 'vesta';
import type { MessageKey } from '@/i18n/keys';

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

export const RESOURCES: TradeResource[] = ['brick', 'lumber', 'wool', 'grain', 'ore'];

export const RESOURCE_EMOJI: Record<string, string> = {
  brick: '🧱', lumber: '🪵', wool: '🐑', grain: '🌾', ore: '🪨',
};

export const DEV_EMOJI: Record<string, string> = {
  victory: '🪙', knight: '💂', 'road-build': '🌉', 'year-of-plenty': '🧺', monopoly: '👑',
};

/** The message key naming each development card, by upstream's card type. */
export const DEV_CARD_KEY = {
  victory: 'games.vestaTable.card.victory',
  knight: 'games.vestaTable.card.knight',
  'road-build': 'games.vestaTable.card.roadBuild',
  'year-of-plenty': 'games.vestaTable.card.yearOfPlenty',
  monopoly: 'games.vestaTable.card.monopoly',
} as const satisfies Record<string, MessageKey>;

/** The take side of a trade is capped here (the bank's whole stock of one resource). */
export const TRADE_TAKE_MAX = 19;
