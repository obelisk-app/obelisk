import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { LANDING_VIDEOS } from '@/constants/marketing/videos';

export function useVideoCarousel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [index, setIndex] = useState(0);
  const [start, setStart] = useState<number | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    return () => video?.pause();
  }, [index]);
  const step = (direction: number) => {
    videoRef.current?.pause();
    setIndex(value => Math.max(0, Math.min(LANDING_VIDEOS.length - 1, value + direction)));
  };
  return {
    index, videoRef,
    previous: () => step(-1), next: () => step(1),
    onTouchStart: (event: TouchEvent<HTMLDivElement>) => setStart(event.touches[0].clientX),
    onTouchEnd: (event: TouchEvent<HTMLDivElement>) => {
      if (start !== null && Math.abs(event.changedTouches[0].clientX - start) > 50) step(event.changedTouches[0].clientX < start ? 1 : -1);
      setStart(null);
    },
  };
}
