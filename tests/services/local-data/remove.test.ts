import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VAULT_DB, VAULT_STORE } from '@/lib/crypto/session-vault';
import { openStore } from '@/lib/crypto/vault-idb';
import {
  LOCAL_DATA_CATEGORIES,
  lowerAllWriteFences,
  measureLocalData,
  removeEverything,
  removeLocalDataCategory,
  type RemovalEnv,
} from '@/services/local-data';
import { FakeCacheStorage, WEB_ENTRIES, isStored, seedWebStorage } from './support';

let idb: IDBFactory;
let cachesDouble: FakeCacheStorage;
type Spy<F extends (...args: never[]) => unknown> = F & ReturnType<typeof vi.fn<F>>;
let env: RemovalEnv & {
  logout: Spy<() => Promise<void>>;
  reload: Spy<() => void>;
  relocate: Spy<() => void>;
  disconnectWallet: Spy<() => Promise<void>>;
  forgetAnalytics: Spy<() => void>;
};

async function databaseNames(): Promise<string[]> {
  return (await idb.databases()).map((d) => d.name ?? '');
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  idb = new IDBFactory();
  (await openStore(idb, VAULT_DB, VAULT_STORE)).close();
  cachesDouble = new FakeCacheStorage();
  cachesDouble.put('obelisk-v9-localized-shell-cache:static', 'https://obelisk.ar/_next/static/a.js', 2048);
  cachesDouble.put('obelisk-v9-localized-shell-cache:shell', 'https://obelisk.ar/app', 1024);
  cachesDouble.put('someone-else', 'https://obelisk.ar/x', 10);
  document.cookie = 'locale=es; Path=/';
  env = {
    logout: vi.fn<() => Promise<void>>(async () => undefined),
    reload: vi.fn<() => void>(),
    relocate: vi.fn<() => void>(),
    disconnectWallet: vi.fn<() => Promise<void>>(async () => undefined),
    forgetAnalytics: vi.fn<() => void>(),
    indexedDB: idb,
    caches: cachesDouble.asCacheStorage(),
    document,
  };
});

afterEach(() => {
  lowerAllWriteFences();
  localStorage.clear();
  sessionStorage.clear();
  document.cookie = 'locale=; Max-Age=0; Path=/';
});

describe('removing one category', () => {
  it.each(LOCAL_DATA_CATEGORIES.map((c) => [c.id, c.after] as const))('%s removes exactly its own keys', async (id) => {
    seedWebStorage();
    localStorage.setItem('unrelated-key', 'kept');
    await removeLocalDataCategory(id, env);
    for (const entry of WEB_ENTRIES) {
      expect(isStored(entry), `${entry.id} after removing ${id}`).toBe(entry.category !== id);
    }
    expect(localStorage.getItem('unrelated-key')).toBe('kept');
  });

  it('reloads after a cache category, without logging out', async () => {
    await removeLocalDataCategory('channels', env);
    expect(env.reload).toHaveBeenCalledTimes(1);
    expect(env.logout).not.toHaveBeenCalled();
    expect(await databaseNames()).toContain(VAULT_DB);
  });

  it('logs out and deletes the vault database when the login is removed', async () => {
    await removeLocalDataCategory('login', env);
    expect(env.logout).toHaveBeenCalledTimes(1);
    expect(await databaseNames()).not.toContain(VAULT_DB);
    expect(env.reload).toHaveBeenCalledTimes(1);
  });

  it('disconnects the wallet before removing its sealed record, without logging out', async () => {
    localStorage.setItem('obelisk-dex/nwc:' + 'e'.repeat(64), '{"v":1}');
    await removeLocalDataCategory('wallet', env);
    expect(env.disconnectWallet).toHaveBeenCalledTimes(1);
    expect(env.logout).not.toHaveBeenCalled();
    expect(Object.keys(localStorage).some((k) => k.startsWith('obelisk-dex/nwc:'))).toBe(false);
    expect(env.reload).toHaveBeenCalledTimes(1);
  });

  it('deletes only the offline caches, and leaves the page as it is', async () => {
    await removeLocalDataCategory('offline', env);
    expect(await cachesDouble.keys()).toEqual(['someone-else']);
    expect(env.reload).not.toHaveBeenCalled();
    expect(env.relocate).not.toHaveBeenCalled();
  });

  it('expires only the analytics cookies, and leaves the page as it is', async () => {
    document.cookie = '_ga=GA1.1.1; Path=/';
    document.cookie = '_ga_BZ4NB66WY0=GS2.1; Path=/';
    await removeLocalDataCategory('analytics', env);
    expect(document.cookie).not.toContain('_ga');
    expect(document.cookie).toContain('locale=es');
    expect(env.reload).not.toHaveBeenCalled();
  });

  it('forgets the Analytics answer too, so Analytics stops and the question is asked again', async () => {
    localStorage.setItem('obelisk:analytics-consent', 'granted');
    localStorage.setItem('obelisk:preferences', '{}');
    await removeLocalDataCategory('analytics', env);
    expect(env.forgetAnalytics).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('obelisk:analytics-consent')).toBeNull();
    expect(localStorage.getItem('obelisk:preferences')).toBe('{}');
  });

  it('expires the language cookie and reloads without the language prefix', async () => {
    expect(document.cookie).toContain('locale=es');
    await removeLocalDataCategory('language', env);
    expect(document.cookie).not.toContain('locale=');
    expect(env.relocate).toHaveBeenCalledTimes(1);
  });

  it('keeps the removed data from being written back before the reload', async () => {
    const { useReadStateStore, ensureReadStateStoreForAccount } = await import('@/store/read-state');
    const { cacheSet } = await import('@/services/nostr-bridge');
    const pubkey = 'd'.repeat(64);
    ensureReadStateStoreForAccount(pubkey);
    useReadStateStore.getState().setGroupCursor('group-1', 1000);
    expect(localStorage.getItem(`obelisk-read-state:${pubkey}`)).not.toBeNull();

    await removeLocalDataCategory('readState', env);
    expect(localStorage.getItem(`obelisk-read-state:${pubkey}`)).toBeNull();

    // The store still holds the old cursors in memory; its next write is dropped.
    useReadStateStore.getState().setGroupCursor('group-2', 2000);
    cacheSet('wss://relay.example', 30078, 'obelisk:readstate:v1', { payload: {}, createdAt: 1 });
    expect(localStorage.getItem(`obelisk-read-state:${pubkey}`)).toBeNull();
    expect(Object.keys(localStorage).filter((k) => k.includes('readstate'))).toEqual([]);
    // Other categories still write.
    cacheSet('wss://relay.example', 39000, 'group-1', { name: 'x' });
    expect(Object.keys(localStorage).some((k) => k.endsWith('/39000/group-1'))).toBe(true);
    ensureReadStateStoreForAccount(null);
  });
});

describe('removing everything', () => {
  it('leaves no key, no vault database, no offline cache and no language cookie', async () => {
    seedWebStorage();
    document.cookie = '_ga=GA1.1.1; Path=/';
    await removeEverything(env);
    expect(document.cookie).not.toContain('_ga');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(await databaseNames()).not.toContain(VAULT_DB);
    expect((await cachesDouble.keys()).filter((k) => k.startsWith('obelisk'))).toEqual([]);
    expect(document.cookie).not.toContain('locale=');
    expect(env.logout).toHaveBeenCalledTimes(1);
    expect(env.relocate).toHaveBeenCalledTimes(1);
    expect(env.forgetAnalytics).toHaveBeenCalledTimes(1);
  });

  it('still clears everything when the logout fails, and lets nothing write afterwards', async () => {
    seedWebStorage();
    env.logout.mockRejectedValueOnce(new Error('signer gone'));
    await removeEverything(env);
    localStorage.setItem('obelisk:preferences', '{}');
    expect(localStorage.length).toBe(0);
  });
});

describe('measuring', () => {
  it('sizes each category, and the offline files from their Content-Length', async () => {
    localStorage.setItem('obelisk:preferences', 'x'.repeat(100));
    const usage = await measureLocalData(cachesDouble.asCacheStorage(), document);
    expect(usage.preferences).toEqual({ bytes: ('obelisk:preferences'.length + 100) * 2, present: true });
    expect(usage.channels).toEqual({ bytes: 0, present: false });
    expect(usage.offline).toEqual({ bytes: 3072, present: true });
    expect(usage.language.present).toBe(true);
  });

  it('counts the Analytics answer as stored, cookies or not', async () => {
    expect((await measureLocalData(cachesDouble.asCacheStorage(), document)).analytics.present).toBe(false);
    localStorage.setItem('obelisk:analytics-consent', 'denied');
    expect((await measureLocalData(cachesDouble.asCacheStorage(), document)).analytics).toEqual({ bytes: null, present: true });
  });
});
