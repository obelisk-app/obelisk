import { describe, expect, it } from 'vitest';
import { handCards } from '@/utils/games/vesta/vesta-hand';

describe('handCards', () => {
  it('names known cards by message key and keys each by type and position', () => {
    expect(handCards([
      { cardType: 'knight', available: true },
      { cardType: 'knight', available: false },
      { cardType: 'mystery', available: true },
    ])).toEqual([
      { key: 'knight-0', cardType: 'knight', emoji: '💂', labelKey: 'games.vestaTable.card.knight', available: true },
      { key: 'knight-1', cardType: 'knight', emoji: '💂', labelKey: 'games.vestaTable.card.knight', available: false },
      { key: 'mystery-2', cardType: 'mystery', emoji: '🎴', labelKey: null, available: true },
    ]);
  });
});
