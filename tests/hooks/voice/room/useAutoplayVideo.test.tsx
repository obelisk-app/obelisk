import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoplayVideo } from '@/hooks/voice/room/useAutoplayVideo';
import { FakeMediaStream, FakeMediaStreamTrack } from '@tests/support/mocks/webrtc';

const asStream = (s: FakeMediaStream) => s as unknown as MediaStream;

describe('useAutoplayVideo', () => {
  let play: ReturnType<typeof vi.spyOn>;
  let el: HTMLVideoElement;
  beforeEach(() => {
    play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async () => {});
    el = document.createElement('video');
  });
  afterEach(() => vi.restoreAllMocks());

  it('binds the stream, forces muted and plays at once', () => {
    const stream = asStream(new FakeMediaStream([new FakeMediaStreamTrack('video')]));
    renderHook(() => useAutoplayVideo({ current: el }, stream));
    expect(el.srcObject).toBe(stream);
    expect(el.muted).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('retries on loadedmetadata, canplay and the video track unmuting, and stops after unmount', () => {
    const track = new FakeMediaStreamTrack('video');
    const stream = asStream(new FakeMediaStream([track]));
    const { unmount } = renderHook(() => useAutoplayVideo({ current: el }, stream));
    el.dispatchEvent(new Event('loadedmetadata'));
    el.dispatchEvent(new Event('canplay'));
    track.dispatchEvent('unmute');
    expect(play).toHaveBeenCalledTimes(4);

    unmount();
    el.dispatchEvent(new Event('canplay'));
    track.dispatchEvent('unmute');
    expect(play).toHaveBeenCalledTimes(4);
  });

  it('swallows an autoplay rejection', async () => {
    play.mockImplementation(() => Promise.reject(new Error('NotAllowedError')));
    const stream = asStream(new FakeMediaStream([new FakeMediaStreamTrack('video')]));
    expect(() => renderHook(() => useAutoplayVideo({ current: el }, stream))).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });

  it('clears srcObject and does not play for a null stream', () => {
    renderHook(() => useAutoplayVideo({ current: el }, null));
    expect(el.srcObject).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });

  it('does nothing without an element', () => {
    const stream = asStream(new FakeMediaStream([new FakeMediaStreamTrack('video')]));
    renderHook(() => useAutoplayVideo({ current: null }, stream));
    expect(play).not.toHaveBeenCalled();
  });
});
