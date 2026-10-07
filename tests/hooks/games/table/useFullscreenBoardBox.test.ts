import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFullscreenBoardBox } from '@/hooks/games/table/useFullscreenBoardBox';
import { FULLSCREEN_CHROME_PX } from '@/constants/games/table';

const original = { w: window.innerWidth, h: window.innerHeight };

function resize(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
  window.dispatchEvent(new Event('resize'));
}

afterEach(() => resize(original.w, original.h));

describe('useFullscreenBoardBox', () => {
  it('is null outside fullscreen', () => {
    const { result } = renderHook(() => useFullscreenBoardBox(false));
    expect(result.current).toBeNull();
  });

  it('gives the window minus the chrome, and follows a resize', () => {
    resize(1440, 900);
    const { result } = renderHook(() => useFullscreenBoardBox(true));
    expect(result.current).toEqual({ width: 1408, height: 900 - FULLSCREEN_CHROME_PX });
    act(() => resize(800, 600));
    expect(result.current).toEqual({ width: 768, height: 600 - FULLSCREEN_CHROME_PX });
  });

  it('never goes below 240 in either direction', () => {
    resize(100, 100);
    const { result } = renderHook(() => useFullscreenBoardBox(true));
    expect(result.current).toEqual({ width: 240, height: 240 });
  });
});
