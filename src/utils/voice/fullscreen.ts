/**
 * Fullscreen helpers for voice tiles (the hook that watches the state is
 * `src/hooks/voice/room/useFullscreenState.ts`).
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
interface FullscreenElementMethods {
  requestFullscreen?: () => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void> | void;
}

export interface FullscreenDocumentMethods {
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
  const current = currentFullscreenElement();

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

/** The document's fullscreen element, standard or webkit-prefixed, or null. */
export function currentFullscreenElement(): Element | null {
  const doc = document as unknown as FullscreenDocumentMethods;
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}
