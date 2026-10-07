import { describe, expect, it } from 'vitest';
import { placeHintCard } from '@/utils/hints/placement';
import { HINT_CARD_WIDTH } from '@/constants/hints/placement';

const viewport = { width: 1000, height: 800 };

describe('placeHintCard', () => {
  it('goes below the anchor, centred on it, when it fits', () => {
    const p = placeHintCard({ top: 100, bottom: 120, left: 400, width: 100 }, 80, viewport);
    expect(p).toEqual({ top: 130, left: 450 - HINT_CARD_WIDTH / 2, below: true });
  });

  it('flips above when there is no room below', () => {
    const p = placeHintCard({ top: 700, bottom: 720, left: 400, width: 100 }, 120, viewport);
    expect(p.below).toBe(false);
    expect(p.top).toBe(700 - 120 - 10);
  });

  it('clamps to the viewport edges', () => {
    expect(placeHintCard({ top: 10, bottom: 20, left: 0, width: 10 }, 40, viewport).left).toBe(8);
    expect(placeHintCard({ top: 10, bottom: 20, left: 990, width: 10 }, 40, viewport).left).toBe(1000 - HINT_CARD_WIDTH - 8);
    expect(placeHintCard({ top: 5, bottom: 790, left: 0, width: 10 }, 40, viewport).top).toBe(8);
  });
});
