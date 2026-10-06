/**
 * Removing local data: one category, or everything.
 *
 * Every removal that leaves the page running against stale memory raises a
 * write fence first (`write-fence.ts`), so nothing writes the removed data
 * back before the reload. The steps that need the app (logging out, the
 * reload itself) come in through `RemovalEnv`, which keeps this module free
 * of the bridge: `cache-clear.ts` and the error panel import it too.
 */
import { categoryById } from './categories';
import { deleteVaultDatabases, removeCookies, removeOfflineFiles } from './browser-stores';
import { clearWebStorage, keyMatcher, removeWebStorageKeys } from './web-storage';
import { raiseWriteFence } from './write-fence';
import type { LocalDataCategoryId } from './types';

export interface RemovalEnv {
  /** End the session (the bridge's logout). */
  readonly logout: () => Promise<void>;
  /** Drop the wallet connection from memory and delete its vault key (the record is web storage). */
  readonly disconnectWallet?: () => Promise<void>;
  /** Reload the page. */
  readonly reload: () => void;
  /** Reload on the same page without the language prefix, so no language is forced. */
  readonly relocate: () => void;
  readonly indexedDB?: IDBFactory;
  readonly caches?: CacheStorage;
  readonly serviceWorker?: ServiceWorkerContainer;
  readonly document?: Document;
}

function fence(categories: ReadonlyArray<LocalDataCategoryId>): void {
  const local = keyMatcher('localStorage', categories);
  const session = keyMatcher('sessionStorage', categories);
  // Lifted by the reload; a category that does not reload keeps no stale writer.
  raiseWriteFence((key) => local(key) || session(key));
}

async function quietly(step: () => Promise<unknown>): Promise<void> {
  try {
    await step();
  } catch { /* a failed step must not stop the rest of the removal */ }
}

/** Remove one category, then do what its `after` says. */
export async function removeLocalDataCategory(id: LocalDataCategoryId, env: RemovalEnv): Promise<void> {
  const { after } = categoryById(id);
  if (after === 'none') {
    if (id === 'offline') await removeOfflineFiles(env.caches, env.serviceWorker);
    removeCookies([id], env.document);
    removeWebStorageKeys([id]);
    return;
  }
  if (after === 'relocate') {
    removeCookies([id], env.document);
    env.relocate();
    return;
  }
  fence([id]);
  if (after === 'logout') {
    await quietly(env.logout);
    removeWebStorageKeys([id]);
    await deleteVaultDatabases(env.indexedDB);
  } else {
    if (id === 'wallet' && env.disconnectWallet) await quietly(env.disconnectWallet);
    removeWebStorageKeys([id]);
  }
  env.reload();
}

/**
 * "Remove everything from this device": log out, then empty both web
 * storages, delete the vault database, the offline caches and the service
 * worker registration, and the cookies (language, analytics), then reload.
 */
export async function removeEverything(env: RemovalEnv): Promise<void> {
  // Every key on this origin is the app's, so every write is fenced.
  raiseWriteFence(() => true);
  await quietly(env.logout);
  clearWebStorage();
  await deleteVaultDatabases(env.indexedDB);
  await removeOfflineFiles(env.caches, env.serviceWorker);
  removeCookies(['language', 'analytics'], env.document);
  env.relocate();
}
