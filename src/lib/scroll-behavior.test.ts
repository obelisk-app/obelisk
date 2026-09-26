import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollBehavior } from './scroll-behavior';

const mockReducedMotion = (matches: boolean) => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches }));
};

afterEach(() => vi.unstubAllGlobals());

describe('scrollBehavior', () => {
  it('animates by default', () => {
    mockReducedMotion(false);
    expect(scrollBehavior()).toBe('smooth');
  });

  it('does not animate when the reader asked for less motion', () => {
    // The CSS `prefers-reduced-motion` override can no longer do this: an
    // explicit `behavior` in scrollTo beats the element's computed value.
    mockReducedMotion(true);
    expect(scrollBehavior()).toBe('auto');
  });

  it('honours a caller that wanted no animation anyway', () => {
    mockReducedMotion(false);
    expect(scrollBehavior('auto')).toBe('auto');
  });

  it('falls back rather than throwing where matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(scrollBehavior()).toBe('smooth');
  });

  it('falls back when the query itself throws', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => { throw new Error('unsupported'); }));
    expect(scrollBehavior()).toBe('smooth');
  });
});
