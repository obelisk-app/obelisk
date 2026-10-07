import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCallFullscreen } from '@/hooks/call/useCallFullscreen';

function setFullscreenElement(el: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => el });
  document.dispatchEvent(new Event('fullscreenchange'));
}

describe('useCallFullscreen', () => {
  let el: HTMLDivElement;
  let ref: React.RefObject<HTMLDivElement | null>;
  beforeEach(() => {
    el = document.createElement('div');
    ref = { current: el };
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
    document.exitFullscreen = vi.fn(async () => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fills the window when the Fullscreen API is unavailable, and Esc leaves', () => {
    const { result } = renderHook(() => useCallFullscreen(ref));
    expect(result.current.full).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.full).toBe(true);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(result.current.full).toBe(false);
  });

  it('toggles the expanded state back off with a second toggle', () => {
    const { result } = renderHook(() => useCallFullscreen(ref));
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    expect(result.current.full).toBe(false);
  });

  it('uses native fullscreen on the view when the browser allows it, and exits through the API', async () => {
    el.requestFullscreen = vi.fn(async () => { setFullscreenElement(el); });
    const { result } = renderHook(() => useCallFullscreen(ref));
    await act(async () => { result.current.toggle(); });
    expect(el.requestFullscreen).toHaveBeenCalled();
    expect(result.current.full).toBe(true);

    act(() => result.current.toggle());
    expect(document.exitFullscreen).toHaveBeenCalled();
    act(() => setFullscreenElement(null));
    expect(result.current.full).toBe(false);
  });

  it('falls back to filling the window when the native request is refused', async () => {
    el.requestFullscreen = vi.fn(async () => { throw new Error('denied'); });
    const { result } = renderHook(() => useCallFullscreen(ref));
    await act(async () => { result.current.toggle(); });
    expect(result.current.full).toBe(true);
  });

  it('ignores another element going fullscreen', () => {
    const { result } = renderHook(() => useCallFullscreen(ref));
    act(() => setFullscreenElement(document.createElement('video')));
    expect(result.current.full).toBe(false);
  });

  it('leaves native fullscreen on unmount so the page is not stuck', async () => {
    el.requestFullscreen = vi.fn(async () => { setFullscreenElement(el); });
    const { result, unmount } = renderHook(() => useCallFullscreen(ref));
    await act(async () => { result.current.toggle(); });
    unmount();
    expect(document.exitFullscreen).toHaveBeenCalled();
  });
});
