'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A muted hero loop: it plays only while a quarter of it is on screen, never
 * for a visitor who asked for reduced motion (the poster stays), and
 * `playing` turns true on the first frame so the video can fade in over the
 * poster. `preload="none"` on the element means nothing downloads until then.
 */
export function useHeroClip() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().then(() => setPlaying(true), () => {});
      else video.pause();
    }, { threshold: 0.25 });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);
  return { ref, playing };
}
