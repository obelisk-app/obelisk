import { describe, expect, it } from 'vitest';
import { railScrollBy, railScrollState } from '@/utils/voice/rail-scroll';

const box = (over: Partial<Record<string, number>> = {}) => ({
  scrollLeft: 0, scrollTop: 0, clientWidth: 100, clientHeight: 200, scrollWidth: 100, scrollHeight: 200, ...over,
});

describe('railScrollState', () => {
  it('shows no arrows when everything fits', () => {
    expect(railScrollState(box(), true)).toEqual({ canPrev: false, canNext: false });
    expect(railScrollState(box(), false)).toEqual({ canPrev: false, canNext: false });
  });

  it('reads the horizontal axis on a phone and the vertical one above', () => {
    const el = box({ scrollLeft: 50, scrollWidth: 400, scrollTop: 0, scrollHeight: 600 });
    expect(railScrollState(el, true)).toEqual({ canPrev: true, canNext: true });
    expect(railScrollState(el, false)).toEqual({ canPrev: false, canNext: true });
  });

  it('allows a few pixels of slack at each end', () => {
    expect(railScrollState(box({ scrollLeft: 4, scrollWidth: 107 }), true)).toEqual({ canPrev: false, canNext: false });
  });
});

describe('railScrollBy', () => {
  it('scrolls 80% of the visible length, smoothly, either way', () => {
    expect(railScrollBy(box(), true, 1)).toEqual({ left: 80, behavior: 'smooth' });
    expect(railScrollBy(box(), false, -1)).toEqual({ top: -160, behavior: 'smooth' });
  });
});
