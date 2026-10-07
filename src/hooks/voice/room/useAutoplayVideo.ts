'use client';

import { useEffect } from 'react';

/**
 * Bind a `<video>` to a stream and keep nudging `play()` until frames
 * arrive. Autoplay policy can reject the first call; `loadedmetadata`,
 * `canplay` and the track's `unmute` are the moments a retry succeeds.
 * Rejections are expected and swallowed. The element is always muted: the
 * voice path plays audio elsewhere.
 */
export function useAutoplayVideo(videoRef: { current: HTMLVideoElement | null }, videoStream: MediaStream | null): void {
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = videoStream;
    el.muted = true;
    if (!videoStream) return;
    const play = () => { void el.play().catch(() => { /* autoplay policy; retried on the events below */ }); };
    play();
    el.addEventListener('loadedmetadata', play);
    el.addEventListener('canplay', play);
    for (const track of videoStream.getVideoTracks()) track.addEventListener('unmute', play);
    return () => {
      el.removeEventListener('loadedmetadata', play);
      el.removeEventListener('canplay', play);
      for (const track of videoStream.getVideoTracks()) track.removeEventListener('unmute', play);
    };
  }, [videoRef, videoStream]);
}
