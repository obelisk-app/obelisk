'use client';

import { useEffect, useState } from 'react';
import { currentTrack, setTrackListener } from '@/lib/games/stacker/audio';

/** The title of whatever the Stacker playlist is playing now, following it as it moves on. */
export function useTrackTitle(): string {
  const [track, setTrack] = useState(() => currentTrack().title);
  useEffect(() => {
    setTrackListener(setTrack);
    return () => setTrackListener(null);
  }, []);
  return track;
}
