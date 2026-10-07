'use client';

import { useBackgroundAudioElement } from '@/hooks/voice/audio/useBackgroundAudioElement';

/** One remote voice, playing whatever screen is on top. */
export default function BackgroundAudioElement({ pubkey, stream }: { pubkey: string; stream: MediaStream }) {
  const { ref, isMutedForMe } = useBackgroundAudioElement(pubkey, stream);
  return <audio ref={ref} autoPlay muted={isMutedForMe} />;
}
