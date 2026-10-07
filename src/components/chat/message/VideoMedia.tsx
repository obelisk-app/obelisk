'use client';

import { useVideoMedia } from '@/hooks/chat/message/useVideoMedia';
import { VoiceMessage } from './VoiceMessage';

export function VideoMedia({
  url,
  authorPicture,
  timestamp,
  wide = false,
  autoLoad = true,
}: {
  url: string;
  authorPicture?: string | null;
  timestamp?: number;
  wide?: boolean;
  /** As {@link VoiceMessage}: `false` fetches nothing until play is pressed. */
  autoLoad?: boolean;
}) {
  const vm = useVideoMedia(url);
  if (vm.voiceDuration !== null) {
    return <VoiceMessage note={{ url, durationSeconds: vm.voiceDuration }} authorPicture={authorPicture} timestamp={timestamp} autoLoad={autoLoad} />;
  }
  return (
    <video
      src={url}
      controls
      preload={autoLoad ? "metadata" : "none"}
      className={`mt-1 rounded-lg bg-lc-black/50 object-contain ${wide ? 'max-h-[32rem] w-full max-w-full' : 'max-h-80 max-w-sm'}`}
      data-testid="video-player"
      onLoadedMetadata={vm.onLoadedMetadata}
    />
  );
}
