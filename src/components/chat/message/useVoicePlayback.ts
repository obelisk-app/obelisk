'use client';

import { useRef, useState } from 'react';
import { nextPlaybackRate } from './audio-time';

/**
 * Play state of one `<audio>` element: whether it is playing, the speed,
 * the position and the length. `duration` starts at the length the note
 * declared and is replaced by the real one once the metadata loads.
 */
export function useVoicePlayback(declaredDuration: number) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(declaredDuration);
  const progress = duration > 0 ? Math.min(current / duration, 1) : 0;

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };
  const cyclePlaybackRate = () => {
    const next = nextPlaybackRate(playbackRate);
    if (audioRef.current) audioRef.current.playbackRate = next;
    setPlaybackRate(next);
  };
  const seek = (next: number) => {
    if (audioRef.current) audioRef.current.currentTime = next;
    setCurrent(next);
  };

  return {
    audioRef,
    playing,
    setPlaying,
    playbackRate,
    current,
    setCurrent,
    duration,
    setDuration,
    progress,
    toggle,
    cyclePlaybackRate,
    seek,
  };
}
