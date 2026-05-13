/**
 * Tiny load/save wrapper around `window.localStorage` for single-key blobs.
 *
 * Each of `relay-info`, `preferences`, `recent-emojis`, etc. used to
 * hand-roll the same try/catch+JSON.parse pair. This helper centralizes
 * it so SSR fallback, quota errors, and corrupted payloads behave
 * uniformly: every load returns the supplied `defaults` rather than
 * throwing, and every save degrades silently on failure.
 *
 * For per-account isolation, prefer the Zustand `persist` middleware with
 * `createEnsureForAccount` (see `src/store/multi-account.ts`).
 */
import { safeJsonParse } from './json-safe';

export interface LocalStore<T> {
  load(): T;
  save(value: T): void;
}

export function createLocalStore<T>(key: string, defaults: T): LocalStore<T> {
  return {
    load(): T {
      if (typeof localStorage === 'undefined') return defaults;
      const raw = localStorage.getItem(key);
      return safeJsonParse<T>(raw, defaults);
    },
    save(value: T): void {
      if (typeof localStorage === 'undefined') return;
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Quota exceeded / private browsing — degrade silently. The live
        // value still lives in module state; persistence is best-effort.
      }
    },
  };
}
