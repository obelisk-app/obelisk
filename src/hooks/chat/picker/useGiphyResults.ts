'use client';

import { useEffect, useState } from 'react';
import { GIPHY_KEY, giphyEntries, giphyRequestUrl, type GiphyPayload } from '@/components/chat/picker/giphy';
import type { MediaCategory, MediaEntry, MediaPickerTab } from '@/components/chat/picker/media-catalog';

/**
 * GIPHY results for the GIF / sticker tabs, debounced 250ms and aborted when
 * the tab, category or query changes. Nothing is fetched without an API
 * key, on the emoji tab, or for Recent.
 */
export function useGiphyResults(tab: MediaPickerTab, category: MediaCategory, query: string): MediaEntry[] {
  const [remote, setRemote] = useState<MediaEntry[]>([]);
  useEffect(() => {
    if (!GIPHY_KEY || tab === 'emoji' || category === 'Recent') return;
    const apiKey = GIPHY_KEY;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setRemote([]);
      const url = giphyRequestUrl(apiKey, tab, category, query);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('GIPHY request failed');
        const payload = await response.json() as GiphyPayload;
        setRemote(giphyEntries(payload, tab, category));
      } catch {
        if (!controller.signal.aborted) setRemote([]);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [category, query, tab]);
  return remote;
}
