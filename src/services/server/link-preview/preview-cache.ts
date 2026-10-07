/**
 * Unfurl results by normalized URL. Successful unfurls are cached this long;
 * failures much shorter, so a site that was down is retried.
 */

import type { LinkPreview } from '@/utils/link-preview/link-preview';

const CACHE_TTL_MS = 60 * 60 * 1000;
const FAILURE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

const cache = new Map<string, { at: number; ttl: number; value: LinkPreview | null }>();

/** A still-fresh entry (whose value may be `null`: a cached failure), or `undefined`. */
export function cachedPreview(key: string): { value: LinkPreview | null } | undefined {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < cached.ttl) return cached;
  return undefined;
}

export function storePreview(key: string, preview: LinkPreview | null): void {
  if (cache.size > MAX_CACHE_ENTRIES) {
    // Cheap eviction: drop the oldest insertion. Map preserves insertion order.
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), ttl: preview ? CACHE_TTL_MS : FAILURE_TTL_MS, value: preview });
}
