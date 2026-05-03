/**
 * Fullscreen helpers for voice tiles.
 *
 * Two-tile use case: the camera/screen-share <video> AND its sibling
 * <audio> need to enter fullscreen together. If you fullscreen just the
 * <video>, the audio element gets evicted from the active focus surface
 * and Safari has been observed to mute it. Wrapping both in a tile <div>
 * and fullscreening the wrapper keeps audio playing through the
 * transition.
 *
 * The Element.requestFullscreen API is well-supported on modern browsers,
 * but iOS Safari long used `webkitRequestFullscreen` and the fullscreen-
 * change event is `webkitfullscreenchange`. Cover both via small fallbacks.
 */
import { useEffect, useState } from 'react';

interface FullscreenElementMethods {
  requestFullscreen?: () => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface FullscreenDocumentMethods {
  fullscreenElement: Element | null;
  webkitFullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
  webkitExitFullscreen?: () => Promise<void> | void;
}

/**
 * Toggle fullscreen on the supplied element. If we're currently in
 * fullscreen on this element (or any element), exit; otherwise enter on
 * the supplied target. Returns a promise that resolves when the browser
 * has finished the transition (caller can await it before measuring
 * layout).
 */
export async function toggleFullscreen(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  const doc = document as unknown as FullscreenDocumentMethods;
  const target = el as unknown as FullscreenElementMethods;
  const current = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;

  if (current) {
    try {
      const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
      if (exit) await Promise.resolve(exit.call(document));
    } catch (e) {
      console.warn('[voice] exitFullscreen failed', e);
    }
    return;
  }

  try {
    const enter = target.requestFullscreen ?? target.webkitRequestFullscreen;
    if (enter) await Promise.resolve(enter.call(el));
  } catch (e) {
    console.warn('[voice] requestFullscreen failed', e);
  }
}

/**
 * React hook: tracks whether the supplied element (via ref.current) is
 * currently the document's fullscreen element. Listens to both the
 * standard `fullscreenchange` and webkit-prefixed event so the button
 * stays in sync with Esc / system fullscreen-exit gestures.
 */
export function useFullscreenState(ref: { current: HTMLElement | null }): boolean {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function update() {
      const doc = document as unknown as FullscreenDocumentMethods;
      const current = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
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
