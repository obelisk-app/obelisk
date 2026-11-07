import { describe, expect, it } from 'vitest';
import { relayDeckDrag, relayDeckSwipeTarget } from '@/utils/relay/deck-swipe';

describe('wallet-style relay gestures', () => {
  it('advances a card on a short swipe without needing half a card of travel', () => {
    expect(relayDeckSwipeTarget(0, -40, 0, 3)).toBe(1);
    expect(relayDeckSwipeTarget(0, 40, 0, 3)).toBe(-1);
    expect(relayDeckSwipeTarget(0, -30, 0, 3)).toBe(0);
    expect(relayDeckSwipeTarget(0, -25, -500, 3)).toBe(1);
  });
  it('bounds momentum and drag to avoid full laps in small decks', () => {
    expect(relayDeckSwipeTarget(0, -900, -3000, 2)).toBe(1);
    expect(relayDeckDrag(0, -900, 2)).toBe(1);
    expect(relayDeckSwipeTarget(0, -900, -3000, 10)).toBe(3);
    expect(relayDeckDrag(0, -9000, 10)).toBe(3);
  });
  it('cancels back to the origin and leaves a single card still', () => {
    expect(relayDeckSwipeTarget(2.1, -100, -500, 5, true)).toBe(2);
    expect(relayDeckSwipeTarget(0, -100, -500, 1)).toBe(0);
    expect(relayDeckDrag(0, -100, 1)).toBe(0);
  });
});
