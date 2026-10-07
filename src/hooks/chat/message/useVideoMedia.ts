'use client';

import { useState, type SyntheticEvent } from 'react';
import { isAudioOnlyWebm } from '@/utils/attachments/attachments';

/**
 * A message video: once its metadata loads, an audio-only `.webm` (a voice
 * note sent as a file) is switched to the voice-note player with its
 * duration; `voiceDuration` is null while it is a video.
 */
export function useVideoMedia(url: string) {
  const [voiceDuration, setVoiceDuration] = useState<number | null>(null);
  return {
    voiceDuration,
    onLoadedMetadata: (event: SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget;
      if (isAudioOnlyWebm(url, video.videoWidth, video.duration)) setVoiceDuration(video.duration);
    },
  };
}
