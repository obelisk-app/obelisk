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
 * `createEnsureForAccount` (see `src/store/common/multi-account.ts`).
 */
import { safeJsonParse } from '@/utils/storage/json-safe';

export interface LocalStore<T> {
  load(): T;
  save(value: T): void;
  remove(): void;
}

export function createLocalStore<T>(key: string, defaults: T): LocalStore<T> {
  return {
    load(): T {
      try {
        if (typeof localStorage === 'undefined') return defaults;
        return safeJsonParse<T>(localStorage.getItem(key), defaults);
      } catch {
        return defaults;
      }
    },
    save(value: T): void {
      try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Quota exceeded / private browsing: degrade silently. The live
        // value still lives in module state; persistence is best-effort.
      }
    },
    remove(): void {
      try {
        if (typeof localStorage === 'undefined') return;
        localStorage.removeItem(key);
      } catch {
        // Unavailable storage must not prevent clearing the live value.
      }
    },
  };
}
