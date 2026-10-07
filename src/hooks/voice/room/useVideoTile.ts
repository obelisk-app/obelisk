import { useRef, type KeyboardEvent } from 'react';
import { useAutoplayVideo } from '@/hooks/voice/room/useAutoplayVideo';
import { useParticipantTile } from '@/hooks/voice/room/useParticipantTile';

/**
 * A camera tile (and the stage): the participant, the `<video>` bound to
 * `videoStream`, the tile element (the fullscreen target), and Enter or
 * Space to pin when the tile is pinnable.
 */
export function useVideoTile(pubkey: string, videoStream: MediaStream | null, onPin?: () => void) {
  const participant = useParticipantTile(pubkey);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  useAutoplayVideo(videoRef, videoStream);
  return {
    ...participant,
    videoRef,
    containerRef,
    onKeyDown: (e: KeyboardEvent) => {
      if (!onPin) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPin(); }
    },
  };
}
