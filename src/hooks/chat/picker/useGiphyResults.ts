'use client';

import { useEffect, useState } from 'react';
import { GIPHY_KEY, fetchGiphyEntries } from '@/services/chat/picker/giphy';
import type { MediaCategory, MediaEntry, MediaPickerTab } from '@/utils/chat/picker/media-catalog';

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
      try {
        setRemote(await fetchGiphyEntries(apiKey, tab, category, query, controller.signal));
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
