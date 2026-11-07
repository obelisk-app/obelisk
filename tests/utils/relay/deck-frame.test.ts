import { describe, expect, it } from 'vitest';
import { relayDeckFrame } from '@/utils/relay/deck-frame';

describe('relayDeckFrame', () => {
  it('keeps the front card opaque and above its neighbors', () => {
    const front = relayDeckFrame(0, 0, 5);
    expect(front.opacity).toBe(1);
    expect(front.zIndex).toBeGreaterThan(relayDeckFrame(1, 0, 5).zIndex);
    expect(front.transform).toContain('scale(1)');
  });
  it('wraps a full rotation and hides distant cards in large decks', () => {
    expect(relayDeckFrame(0, 0, 5)).toEqual(relayDeckFrame(0, 5, 5));
    expect(relayDeckFrame(5, 0, 12).opacity).toBe(0);
  });
  it('keeps one relay stationary', () => {
    expect(relayDeckFrame(0, 0, 1)).toEqual({ transform: 'perspective(900px)', opacity: 1, zIndex: 1 });
  });
});
