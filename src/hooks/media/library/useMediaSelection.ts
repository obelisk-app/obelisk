'use client';

import { useState } from 'react';
import type { JsMediaItem } from '@/services/nostr-bridge';

/** URL-based bulk selection survives filtering without changing source items. */
export function useMediaSelection(items: readonly JsMediaItem[]) {
  const [urls, setUrls] = useState<readonly string[]>([]);
  const toggle = (item: JsMediaItem) => setUrls((current) => current.includes(item.url)
    ? current.filter((url) => url !== item.url) : [...current, item.url]);
  return { urls, toggle, selected: items.filter((item) => urls.includes(item.url)) };
}
