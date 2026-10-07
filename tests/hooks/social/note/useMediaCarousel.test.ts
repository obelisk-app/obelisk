import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMediaCarousel } from '@/hooks/social/note/useMediaCarousel';

const items = [{ url: 'a.jpg' }, { url: 'b.mp4', mimeType: 'video/mp4' }, { url: 'c.jpg' }];

describe('useMediaCarousel', () => {
  it('zooms a still and steps through the stills only', () => {
    const { result } = renderHook(() => useMediaCarousel(items));
    expect(result.current.stills).toEqual(['a.jpg', 'c.jpg']);
    act(() => result.current.openAt('c.jpg'));
    expect(result.current.zoom).toBe(1);
    act(() => result.current.nextZoom());
    expect(result.current.zoom).toBe(0);
    act(() => result.current.prevZoom());
    expect(result.current.zoom).toBe(1);
    act(() => result.current.closeZoom());
    expect(result.current.zoom).toBeNull();
  });

  it('ignores a url that is not a still', () => {
    const { result } = renderHook(() => useMediaCarousel(items));
    act(() => result.current.openAt('b.mp4'));
    expect(result.current.zoom).toBeNull();
  });

  it('follows the track and scrolls it to a slide', () => {
    const { result } = renderHook(() => useMediaCarousel(items));
    const track = document.createElement('div');
    Object.defineProperty(track, 'clientWidth', { value: 300 });
    Object.defineProperty(track, 'scrollLeft', { value: 610 });
    track.scrollTo = vi.fn() as never;
    (result.current.trackRef as { current: HTMLDivElement | null }).current = track;
    act(() => result.current.onScroll());
    expect(result.current.index).toBe(2);
    result.current.goTo(1);
    expect(track.scrollTo).toHaveBeenCalledWith({ left: 300, behavior: 'smooth' });
  });

  it('does nothing without a track', () => {
    const { result } = renderHook(() => useMediaCarousel(items));
    expect(() => { result.current.goTo(1); result.current.onScroll(); }).not.toThrow();
    expect(result.current.index).toBe(0);
  });
});
