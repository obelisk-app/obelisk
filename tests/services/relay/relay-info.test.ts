import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRelayInfo, operatorPubkeyFromRelayInfo, suggestedRelaysFromEnv } from '@/services/relay/relay-info';

import { removeLocalDataCategory } from '@/services/local-data/remove';
import { lowerAllWriteFences } from '@/services/local-data/write-fence';
import { invalidateRuntimeCaches } from '@/services/local-data/runtime-caches';

const SERVICE_KEY = 'a'.repeat(64);
const CONTACT_NPUB = 'npub1m9vsm9d8sy0pevcjhenwm4ny6l37dm2hsg4dnusna43ql3n5305qy4zlg4';

describe('operatorPubkeyFromRelayInfo', () => {
  it('prefers a valid human operator contact over the relay service key', () => {
    expect(operatorPubkeyFromRelayInfo({
      pubkey: SERVICE_KEY,
      contact: CONTACT_NPUB,
      fetchedAt: 0,
    })).toBe('d9590d95a7811e1cb312be66edd664d7e3e6ed57822ad9f213ed620fc6748be8');
  });

  it('falls back to the service key when contact is not a valid npub', () => {
    expect(operatorPubkeyFromRelayInfo({
      pubkey: SERVICE_KEY,
      contact: 'ops@example.com',
      fetchedAt: 0,
    })).toBe(SERVICE_KEY);
  });

  it('returns null without a usable operator identity', () => {
    expect(operatorPubkeyFromRelayInfo(null)).toBeNull();
  });
});

describe('suggestedRelaysFromEnv', () => {
  it('returns no suggestions when the deployment does not configure them', () => {
    expect(suggestedRelaysFromEnv()).toEqual([]);
  });

  it('keeps unique valid secure relay URLs in deployment order', () => {
    expect(suggestedRelaysFromEnv(' wss://one.example,invalid,ws://two.example,wss://one.example,wss://three.example ')).toEqual([
      { url: 'wss://one.example' },
      { url: 'wss://three.example' },
    ]);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('relay information cache invalidation', () => {
  afterEach(() => {
    invalidateRuntimeCaches({ categories: ['channels'] });
    vi.unstubAllGlobals();
    lowerAllWriteFences();
    localStorage.clear();
  });

  it('refetches a successfully cached relay after its category is removed', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'Before removal' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'After removal' }) });
    vi.stubGlobal('fetch', fetch);
    expect((await fetchRelayInfo('wss://removed.example'))?.name).toBe('Before removal');
    await removeLocalDataCategory('channels', { logout: vi.fn(), reload: vi.fn(), relocate: vi.fn() });
    expect(localStorage.getItem('obelisk:relay-info-v3')).toBeNull();
    expect((await fetchRelayInfo('wss://removed.example'))?.name).toBe('After removal');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('aborts retired lookups and keeps a replacement single-flight request intact', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const fetch = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.stubGlobal('fetch', fetch);
    const old = fetchRelayInfo('wss://info.example');
    await Promise.resolve();
    const oldSignal = fetch.mock.calls[0][1].signal as AbortSignal;
    invalidateRuntimeCaches({ categories: ['channels'] });
    expect(oldSignal.aborted).toBe(true);
    const replacement = fetchRelayInfo('wss://info.example');
    await Promise.resolve();
    first.resolve({ ok: true, json: async () => ({ name: 'Old' }) } as Response);
    expect(await old).toBeNull();
    expect(localStorage.getItem('obelisk:relay-info-v3')).toBeNull();
    const joined = fetchRelayInfo('wss://info.example');
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(2);
    second.resolve({ ok: true, json: async () => ({ name: 'New' }) } as Response);
    expect((await replacement)?.name).toBe('New');
    expect((await joined)?.name).toBe('New');
    expect((await fetchRelayInfo('wss://info.example'))?.name).toBe('New');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not persist a response whose body finishes after invalidation', async () => {
    const body = deferred<unknown>();
    const json = vi.fn(() => body.promise);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json })));
    const pending = fetchRelayInfo('wss://body.example');
    await vi.waitFor(() => expect(json).toHaveBeenCalledOnce());
    invalidateRuntimeCaches({ categories: ['channels'] });
    body.resolve({ name: 'Stale' });
    expect(await pending).toBeNull();
    expect(localStorage.getItem('obelisk:relay-info-v3')).toBeNull();
  });
});
