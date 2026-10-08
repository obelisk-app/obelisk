import type { JsMediaKind } from '@/services/nostr-bridge';
import { inferMediaKind, isStickerLikeImage } from '@/utils/media/tags/media-kind';
import { registerRuntimeCache } from '@/services/local-data/runtime-caches';

const detected = new Map<string, { promise: Promise<JsMediaKind>; cancel: () => void }>();
const MAX_ENTRIES = 500;
const TIMEOUT_MS = 10_000;

export function detectGifPresentation(url: string): Promise<JsMediaKind> {
  if (inferMediaKind(url) !== 'gif' || typeof Image === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(inferMediaKind(url));
  }
  const cached = detected.get(url);
  if (cached) return cached.promise;
  const image = new Image();
  let cancel = () => {};
  const promise = new Promise<JsMediaKind>((resolve) => {
    let settled = false;
    const finish = (kind: JsMediaKind) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      resolve(kind);
    };
    cancel = () => { finish('gif'); image.removeAttribute('src'); };
    const timer = setTimeout(cancel, TIMEOUT_MS);
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const scale = Math.min(1, 64 / image.naturalWidth, 64 / image.naturalHeight);
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return finish('gif');
        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        finish(isStickerLikeImage(image.naturalWidth, image.naturalHeight, pixels) ? 'sticker' : 'gif');
      } catch { finish('gif'); }
    };
    image.onerror = () => finish('gif');
    image.src = url;
  });
  if (detected.size >= MAX_ENTRIES) {
    const oldest = detected.keys().next().value!;
    detected.get(oldest)?.cancel();
    detected.delete(oldest);
  }
  detected.set(url, { promise, cancel });
  return promise;
}

registerRuntimeCache({
  id: 'gif-presentation', category: 'channels', scope: 'account', sensitive: false,
  inspect: () => ({ entries: detected.size }),
  invalidate: () => {
    for (const entry of detected.values()) entry.cancel();
    detected.clear();
  },
});
