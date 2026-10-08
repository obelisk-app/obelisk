import type { LocalDataCategoryId } from './inventory';

/** Public data may survive account changes; account caches must not. */
export type RuntimeCacheScope = 'account' | 'public';

export interface RuntimeCacheFilter {
  readonly categories?: readonly LocalDataCategoryId[];
  readonly scope?: RuntimeCacheScope;
}

export interface RuntimeCacheCounts {
  readonly entries?: number;
  readonly pending?: number;
}

export type RuntimeCacheInvalidationReason = 'manual' | 'storage-removal' | 'account-change';

export interface RuntimeCacheRegistration {
  readonly id: string;
  readonly category: LocalDataCategoryId;
  readonly scope: RuntimeCacheScope;
  readonly sensitive: boolean;
  readonly inspect?: () => RuntimeCacheCounts;
  /** Synchronously retire pending work and clear disposable state; preserve subscribers. */
  readonly invalidate: (reason: RuntimeCacheInvalidationReason) => void;
}

export interface RuntimeCacheSnapshot extends RuntimeCacheCounts {
  readonly id: string;
  readonly category: LocalDataCategoryId;
  readonly scope: RuntimeCacheScope;
  readonly sensitive: boolean;
}

export interface RuntimeCacheInvalidation {
  readonly cleared: readonly string[];
  readonly failed: readonly string[];
}
