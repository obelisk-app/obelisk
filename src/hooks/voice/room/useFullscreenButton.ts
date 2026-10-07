import type { MouseEvent } from 'react';
import { toggleFullscreen } from '@/utils/voice/fullscreen';
import { useFullscreenState } from '@/hooks/voice/room/useFullscreenState';

/**
 * A tile's fullscreen toggle: whether `targetRef` is fullscreen now, and the
 * toggle, which stops the click before the tile's pin handler.
 */
export function useFullscreenButton(targetRef: { current: HTMLElement | null }) {
  const isFullscreen = useFullscreenState(targetRef);
  return {
    isFullscreen,
    toggle: (e: MouseEvent) => {
      e.stopPropagation();
      void toggleFullscreen(targetRef.current);
    },
  };
}
