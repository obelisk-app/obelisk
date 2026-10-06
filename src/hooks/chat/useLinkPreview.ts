'use client';

import { useEffect, useState } from 'react';
import type { LinkPreview as Preview } from '@/utils/link-preview';

/**
 * The unfurl of `url` from our own `/api/link-preview`, or null until (and
 * unless) one arrives. Errors and error payloads stay null; a URL change
 * aborts the request in flight.
 */
export function useLinkPreview(url: string): Preview | null {
  const [preview, setPreview] = useState<Preview | null>(null);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Preview | null) => {
        if (!cancelled && data && !('error' in data)) setPreview(data);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url]);

  return preview;
}
