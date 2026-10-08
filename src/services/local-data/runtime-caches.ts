import type {
  RuntimeCacheFilter, RuntimeCacheInvalidation, RuntimeCacheInvalidationReason, RuntimeCacheRegistration, RuntimeCacheSnapshot,
} from '@/types/local-data/runtime-cache';

// Owners register only when loaded. Inspection/removal must not load features or open sockets.
const registrations = new Map<string, RuntimeCacheRegistration>();

/** A repeated registration replaces its owner (e.g. Fast Refresh); an old disposer cannot remove it. */
export function registerRuntimeCache(cache: RuntimeCacheRegistration): () => void {
  const registration = { ...cache };
  registrations.set(cache.id, registration);
  return () => {
    if (registrations.get(cache.id) === registration) registrations.delete(cache.id);
  };
}

function selected(filter: RuntimeCacheFilter): RuntimeCacheRegistration[] {
  return [...registrations.values()].filter((cache) =>
    (!filter.categories || filter.categories.includes(cache.category))
    && (!filter.scope || filter.scope === cache.scope));
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** Metadata and counts only, never item keys, values, account identifiers or callbacks. */
export function inspectRuntimeCaches(filter: RuntimeCacheFilter = {}): RuntimeCacheSnapshot[] {
  return selected(filter).map(({ id, category, scope, sensitive, inspect }) => {
    let entries: number | undefined;
    let pending: number | undefined;
    try {
      const counts = inspect?.();
      entries = count(counts?.entries);
      pending = count(counts?.pending);
    } catch { /* One unavailable owner must not hide the rest of the inventory. */ }
    return { id, category, scope, sensitive, entries, pending };
  });
}

/** Owners must cancel timers and retire in-flight completions before clearing their cache. */
export function invalidateRuntimeCaches(filter: RuntimeCacheFilter = {}, reason: RuntimeCacheInvalidationReason = 'manual'): RuntimeCacheInvalidation {
  const cleared: string[] = [];
  const failed: string[] = [];
  for (const cache of selected(filter)) {
    try {
      cache.invalidate(reason);
      cleared.push(cache.id);
    } catch {
      failed.push(cache.id);
    }
  }
  return { cleared, failed };
}
