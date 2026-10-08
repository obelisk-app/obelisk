import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspectRuntimeCaches, invalidateRuntimeCaches, registerRuntimeCache } from '@/services/local-data/runtime-caches';
import { removeLocalDataCategory } from '@/services/local-data/remove';
import { clearAllClientCacheExceptSession } from '@/services/local-data/cache-clear';
import { lowerAllWriteFences } from '@/services/local-data/write-fence';
import type { RuntimeCacheRegistration } from '@/types/local-data/runtime-cache';

const disposers: Array<() => void> = [];
function register(cache: RuntimeCacheRegistration) {
  const dispose = registerRuntimeCache(cache);
  disposers.push(dispose);
  return dispose;
}
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  lowerAllWriteFences();
  localStorage.clear();
});

it('inspects only metadata and valid counts without calling invalidators', () => {
  const invalidate = vi.fn();
  register({ id: 'notes', category: 'channels', scope: 'public', sensitive: false,
    inspect: () => ({ entries: 3, pending: 1, secret: 'must not escape' }), invalidate });
  register({ id: 'broken', category: 'profiles', scope: 'account', sensitive: true,
    inspect: () => { throw new Error('unavailable'); }, invalidate });
  expect(inspectRuntimeCaches()).toEqual([
    { id: 'notes', category: 'channels', scope: 'public', sensitive: false, entries: 3, pending: 1 },
    { id: 'broken', category: 'profiles', scope: 'account', sensitive: true, entries: undefined, pending: undefined },
  ]);
  expect(invalidate).not.toHaveBeenCalled();
});

it('selects category and scope together and isolates owner failures', () => {
  const publicClear = vi.fn();
  const accountClear = vi.fn();
  register({ id: 'public', category: 'channels', scope: 'public', sensitive: false, invalidate: publicClear });
  register({ id: 'broken', category: 'channels', scope: 'account', sensitive: true, invalidate: () => { throw new Error(); } });
  register({ id: 'private', category: 'channels', scope: 'account', sensitive: true, invalidate: accountClear });
  expect(invalidateRuntimeCaches({ categories: ['channels'], scope: 'account' })).toEqual({ cleared: ['private'], failed: ['broken'] });
  expect(accountClear).toHaveBeenCalledOnce();
  expect(publicClear).not.toHaveBeenCalled();
  expect(inspectRuntimeCaches({ categories: [] })).toEqual([]);
});

it('keeps a replacement registration when the former owner disposes', () => {
  const oldClear = vi.fn();
  const newClear = vi.fn();
  const disposeOld = register({ id: 'notes', category: 'channels', scope: 'public', sensitive: false, invalidate: oldClear });
  register({ id: 'notes', category: 'channels', scope: 'public', sensitive: false, invalidate: newClear });
  disposeOld();
  invalidateRuntimeCaches();
  expect(newClear).toHaveBeenCalledOnce();
  expect(oldClear).not.toHaveBeenCalled();
});

describe('category removal', () => {
  it('fences writes before clearing either public or account caches and reloading', async () => {
    const key = 'obelisk-cache-v4/relay/1/note';
    const clear = vi.fn(() => localStorage.setItem(key, 'late writer'));
    register({ id: 'public', category: 'channels', scope: 'public', sensitive: false, invalidate: clear });
    register({ id: 'account', category: 'channels', scope: 'account', sensitive: true, invalidate: clear });
    const reload = vi.fn(() => expect(clear).toHaveBeenCalledTimes(2));
    await removeLocalDataCategory('channels', { logout: vi.fn(), reload, relocate: vi.fn() });
    localStorage.setItem(key, 'after removal');
    expect(localStorage.getItem(key)).toBeNull();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('error recovery clears disposable owners while leaving device data alone', () => {
    const clear = vi.fn();
    const preserve = vi.fn();
    register({ id: 'public', category: 'profiles', scope: 'public', sensitive: false, invalidate: clear });
    register({ id: 'device', category: 'personal', scope: 'account', sensitive: true, invalidate: preserve });
    clearAllClientCacheExceptSession();
    expect(clear).toHaveBeenCalledOnce();
    expect(preserve).not.toHaveBeenCalled();
  });
});
