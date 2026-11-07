import { describe, expect, it } from 'vitest';
import { relayDeckFrame } from '@/utils/relay/deck-frame';

describe('relayDeckFrame', () => {
  it('keeps the front card opaque and above its neighbors', () => {
    const front = relayDeckFrame(0, 0, 5);
    expect(front.style.opacity).toBe(1);
    expect(front.style.zIndex).toBeGreaterThan(relayDeckFrame(1, 0, 5).style.zIndex);
    expect(front.style.transform).toContain('scale(1)');
  });
  it('wraps a full rotation and hides distant cards in large decks', () => {
    expect(relayDeckFrame(0, 0, 5)).toEqual(relayDeckFrame(0, 5, 5));
    expect(relayDeckFrame(5, 0, 12).style.opacity).toBe(0);
    expect(relayDeckFrame(5, 0, 12).style.pointerEvents).toBe('none');
  });
  it('keeps one relay stationary', () => {
    expect(relayDeckFrame(0, 0, 1)).toEqual(relayDeckFrame(0, 10, 1));
    expect(relayDeckFrame(0, 0, 1).style.transform).toContain('translateY(0px) scale(1)');
  });
  it('exposes a rear-card peek with only two relays', () => {
    // At scale .68, the rear card must extend past the front card's 120px half-height.
    const rear = relayDeckFrame(1, 0, 2);
    const y = Number(rear.style.transform.match(/translateY\(([^p]+)px\)/)![1]);
    expect(y + 120 * 0.68).toBeGreaterThan(120);
    expect(rear.peekStyle.opacity).toBe(1);
    expect(rear.peekStyle.bottom).toBe(8);
    expect(rear.style.opacity).toBeGreaterThan(0);
  });
  it('travels around a circle between settled cards, rather than interpolating endpoint transforms', () => {
    const start = relayDeckFrame(0, 0, 2);
    const middle = relayDeckFrame(0, 0.5, 2);
    const end = relayDeckFrame(0, 1, 2);
    expect(start.style.transform).toContain('translateY(0px)');
    expect(middle.style.transform).toContain('translateY(-76px)');
    expect(end.style.transform).toContain('scale(0.68)');
    expect(middle.contentStyle.opacity).toBe(0);
  });
});
