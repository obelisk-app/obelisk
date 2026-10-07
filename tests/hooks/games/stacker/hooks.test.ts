import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const audio = vi.hoisted(() => ({ listener: null as ((title: string) => void) | null }));
vi.mock('@/lib/games/stacker/audio', () => ({
  currentTrack: () => ({ url: 'u', title: 'First' }),
  setTrackListener: (fn: ((title: string) => void) | null) => { audio.listener = fn; },
}));

import { useTrackTitle } from '@/hooks/games/stacker/useTrackTitle';
import { useStackerCellSize } from '@/hooks/games/stacker/useStackerCellSize';
import { HEIGHT } from '@/lib/games/stacker/engine';

const original = { w: window.innerWidth, h: window.innerHeight };
function resize(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
  window.dispatchEvent(new Event('resize'));
}
afterEach(() => resize(original.w, original.h));

describe('useTrackTitle', () => {
  it('follows the playlist and lets go on unmount', () => {
    const { result, unmount } = renderHook(() => useTrackTitle());
    expect(result.current).toBe('First');
    act(() => audio.listener?.('Second'));
    expect(result.current).toBe('Second');
    unmount();
    expect(audio.listener).toBeNull();
  });
});

describe('useStackerCellSize', () => {
  it('fits the well to the window, between 12 and 30 pixels', () => {
    resize(1600, 1200);
    const { result } = renderHook(() => useStackerCellSize(false));
    expect(result.current).toBe(30);
    act(() => resize(400, 260 + HEIGHT * 15));
    expect(result.current).toBe(Math.min(15, Math.floor((400 - 190) / 10)));
    act(() => resize(100, 100));
    expect(result.current).toBe(12);
  });

  it('leaves less chrome in fullscreen', () => {
    resize(2000, 190 + HEIGHT * 20);
    const { result } = renderHook(() => useStackerCellSize(true));
    expect(result.current).toBe(20);
  });
});
