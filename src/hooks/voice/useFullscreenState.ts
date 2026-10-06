import { useEffect, useState } from 'react';
import { currentFullscreenElement } from '@/utils/fullscreen';

/**
 * Whether the supplied element (via ref.current) is currently the document's
 * fullscreen element. Listens to both the standard `fullscreenchange` and the
 * webkit-prefixed event so the button stays in sync with Esc / system
 * fullscreen-exit gestures.
 */
export function useFullscreenState(ref: { current: HTMLElement | null }): boolean {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function update() {
      const current = currentFullscreenElement();
      setIsFullscreen(!!current && current === ref.current);
    }
    update();
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    return () => {
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update);
    };
  }, [ref]);

  return isFullscreen;
}
