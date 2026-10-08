import type { JsMediaKind } from '@/services/nostr-bridge';

export function inferMediaKind(url: string): JsMediaKind {
  return /\.gif(?:$|[?#])/i.test(url) ? 'gif' : 'emoji';
}

export function isStickerLikeImage(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
): boolean {
  if (width <= 0 || height <= 0 || width > 512 || height > 512 || rgba.length < 4) return false;
  let transparent = 0;
  for (let index = 3; index < rgba.length; index += 4) {
    if (rgba[index] < 224) transparent += 1;
  }
  return transparent / (rgba.length / 4) >= 0.08;
}
