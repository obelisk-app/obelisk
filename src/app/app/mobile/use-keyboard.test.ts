import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useKeyboardInset } from './use-keyboard';

type FakeVisualViewport = {
  height: number;
  offsetTop: number;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  dispatchEvent: (event: Event) => boolean;
};

function makeFakeVisualViewport(height: number, offsetTop = 0): FakeVisualViewport {
  const listeners: Record<string, Set<EventListener>> = {};
  return {
    height,
    offsetTop,
    addEventListener: vi.fn((type: string, fn: EventListener) => {
      (listeners[type] ??= new Set()).add(fn);
    }),
    removeEventListener: vi.fn((type: string, fn: EventListener) => {
      listeners[type]?.delete(fn);
    }),
    dispatchEvent: (event: Event) => {
      listeners[event.type]?.forEach((fn) => fn(event));
      return true;
    },
  };
}

function installVisualViewport(vv: FakeVisualViewport | undefined) {
  Object.defineProperty(window, 'visualViewport', {
    value: vv,
    writable: true,
    configurable: true,
  });
}

describe('useKeyboardInset', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', {
      value: 800,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    installVisualViewport(undefined);
  });

  it('returns 0 when visualViewport is unavailable', () => {
    installVisualViewport(undefined);
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
  });

  it('returns 0 when the keyboard is closed (full viewport)', () => {
    installVisualViewport(makeFakeVisualViewport(800));
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(0);
  });

  it('returns the inset once the keyboard opens past the high threshold', () => {
    const vv = makeFakeVisualViewport(800);
    installVisualViewport(vv);
    const { result } = renderHook(() => useKeyboardInset());
    act(() => {
      vv.height = 500;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(300);
  });

  it('does not open at sub-threshold inset (e.g. browser-chrome reflow)', () => {
    const vv = makeFakeVisualViewport(800);
    installVisualViewport(vv);
    const { result } = renderHook(() => useKeyboardInset());
    act(() => {
      vv.height = 700;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(0);
  });

  it('keeps the keyboard open across the hysteresis band and closes only below the low threshold', () => {
    const vv = makeFakeVisualViewport(800);
    installVisualViewport(vv);
    const { result } = renderHook(() => useKeyboardInset());

    act(() => {
      vv.height = 500;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(300);

    act(() => {
      vv.height = 700;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(100);

    act(() => {
      vv.height = 750;
      vv.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(0);
  });

  it('accounts for visualViewport.offsetTop when computing the inset', () => {
    const vv = makeFakeVisualViewport(500, 50);
    installVisualViewport(vv);
    const { result } = renderHook(() => useKeyboardInset());
    expect(result.current).toBe(250);
  });

  it('attaches a resize listener on mount and detaches it on unmount', () => {
    const vv = makeFakeVisualViewport(800);
    installVisualViewport(vv);
    const { unmount } = renderHook(() => useKeyboardInset());

    expect(vv.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));

    unmount();

    expect(vv.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });
});
