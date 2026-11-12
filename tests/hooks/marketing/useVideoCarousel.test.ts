import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useVideoCarousel } from '@/hooks/marketing/useVideoCarousel';
import { LANDING_VIDEOS } from '@/constants/marketing/videos';

describe('video navigation', () => {
  it('keeps navigation within the curated videos', () => {
    const { result } = renderHook(useVideoCarousel);
    act(() => result.current.previous());
    expect(result.current.index).toBe(0);
    for (let i = 0; i < LANDING_VIDEOS.length + 1; i++) act(() => result.current.next());
    expect(result.current.index).toBe(LANDING_VIDEOS.length - 1);
  });
  it('pauses local media before switching slides', () => {
    const { result } = renderHook(useVideoCarousel);
    const video = document.createElement('video');
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => {});
    result.current.videoRef.current = video;
    act(() => result.current.next());
    expect(pause).toHaveBeenCalled();
  });

});
