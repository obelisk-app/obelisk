'use client';

import { useEffect, useRef } from 'react';

/**
 * Object URLs for local previews, all revoked on unmount. `preview` returns
 * null when the browser refuses; `release` revokes one early.
 */
export function usePreviewUrls() {
  // Every object URL this composer minted, so unmount can revoke the lot.
  const previewUrls = useRef(new Set<string>());

  useEffect(() => {
    const urls = previewUrls.current;
    return () => { for (const u of urls) URL.revokeObjectURL(u); urls.clear(); };
  }, []);

  const preview = (file: Blob) => {
    try {
      const url = URL.createObjectURL(file);
      previewUrls.current.add(url);
      return url;
    } catch {
      return null;
    }
  };
  const release = (url: string | null) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    previewUrls.current.delete(url);
  };
  return { preview, release };
}
