'use client';

import { useState } from 'react';
import { toPng } from 'html-to-image';

/**
 * Rasterize a DOM node to PNG and trigger a download. `pixelWidth` lets us
 * upscale to the banner's intended export size regardless of how wide the
 * preview is rendered on screen.
 */
export function usePngDownload(
  targetRef: React.RefObject<HTMLElement | null>,
  filename: string,
  pixelWidth?: number,
) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    const node = targetRef.current;
    if (!node) return;
    setBusy(true);
    try {
      const rect = node.getBoundingClientRect();
      const pixelRatio = pixelWidth
        ? Math.max(1, pixelWidth / rect.width)
        : 2;
      const dataUrl = await toPng(node, {
        pixelRatio,
        cacheBust: true,
        backgroundColor: '#0a0a0a',
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setBusy(false);
    }
  };
  return { busy, download };
}
