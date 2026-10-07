import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import ShootingStars from '@/components/ui/animations/ShootingStars';

/** Just enough of a 2D context for the streaks to be drawn. */
function fakeContext() {
  return {
    clearRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    strokeStyle: '', fillStyle: '', lineWidth: 0,
  };
}

let frames: FrameRequestCallback[];

beforeEach(() => {
  frames = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeContext() as never);
  vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => frames.push(cb)));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ShootingStars', () => {
  it('draws a fixed, click-through canvas the size of the window, hidden from screen readers', () => {
    const { container } = render(<ShootingStars />);
    const canvas = container.querySelector('canvas')!;
    expect(canvas.className).toBe('fixed inset-0 pointer-events-none z-0');
    expect(canvas.getAttribute('aria-hidden')).toBe('true');
    expect(canvas.width).toBe(window.innerWidth);
    expect(canvas.height).toBe(window.innerHeight);
  });

  it('runs a frame loop, and stops it and its resize listener on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<ShootingStars />);
    expect(frames).toHaveLength(1);
    frames[0](performance.now() + 16);
    expect(frames).toHaveLength(2);
    const onResize = add.mock.calls.find(([type]) => type === 'resize')?.[1];
    expect(onResize).toBeTypeOf('function');
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith('resize', onResize);
  });

  it('contained, fills its card and follows the card\'s size instead of the window\'s', () => {
    const observed: Element[] = [];
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      observe(el: Element) { observed.push(el); }
      disconnect() { disconnect(); }
    });
    const add = vi.spyOn(window, 'addEventListener');
    const { container, unmount } = render(<div data-testid="card"><ShootingStars contained count={2} /></div>);
    const canvas = container.querySelector('canvas')!;
    expect(canvas.className).toBe('absolute inset-0 pointer-events-none w-full h-full');
    expect(observed).toEqual([container.querySelector('[data-testid="card"]')]);
    expect(add.mock.calls.some(([type]) => type === 'resize')).toBe(false);
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
