import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nip05CacheSize, parseNip05, peekNip05, recordNip05Resolution, resetNip05Cache, subscribeNip05, verifyNip05 } from '@/services/identity/nip05-verify';
import { NIP05_CACHE_MAX, NIP05_UNVERIFIED_TTL_MS, NIP05_VERIFIED_TTL_MS } from '@/constants/identity/nip05-verify';

const PUBKEY = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let fetchMock: FetchMock;

beforeEach(() => {
  resetNip05Cache();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('parseNip05', () => {
  it('splits name and domain, lowercasing the domain', () => {
    expect(parseNip05('Alice@Example.COM')).toEqual({ local: 'Alice', domain: 'example.com' });
  });

  it('defaults a bare domain to the _ name', () => {
    expect(parseNip05('example.com')).toEqual({ local: '_', domain: 'example.com' });
  });

  it('rejects things that are not identifiers', () => {
    expect(parseNip05('verified ✓')).toBeNull();
    expect(parseNip05('')).toBeNull();
    expect(parseNip05(null)).toBeNull();
    expect(parseNip05('a@b')).toBeNull();
  });
});

describe('verifyNip05', () => {
  it('verifies when names[local] is the pubkey', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ names: { alice: PUBKEY } }));
    await expect(verifyNip05(PUBKEY, 'alice@example.com')).resolves.toBe('verified');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.com/.well-known/nostr.json?name=alice');
    // No redirects: a redirect would hand the reader's IP to a second host.
    expect(init.redirect).toBe('manual');
    expect(init.credentials).toBe('omit');
  });

  it('is unverified when the name maps to a different pubkey', async () => {
    // This is the impersonation case: a profile claims jack@cash.app but
    // cash.app says jack is someone else.
    fetchMock.mockResolvedValue(jsonResponse({ names: { jack: OTHER } }));
    await expect(verifyNip05(PUBKEY, 'jack@cash.app')).resolves.toBe('unverified');
  });

  it('is unverified when the names entry is missing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ names: { someoneelse: PUBKEY } }));
    await expect(verifyNip05(PUBKEY, 'alice@example.com')).resolves.toBe('unverified');
  });

  it('is unverified when the document has no names table', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ relays: {} }));
    await expect(verifyNip05(PUBKEY, 'alice@example.com')).resolves.toBe('unverified');
  });

  it('is unverified on malformed JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>not json', { status: 200 }));
    await expect(verifyNip05(PUBKEY, 'alice@example.com')).resolves.toBe('unverified');
  });

  it('is unverified on a non-200 response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ names: { alice: PUBKEY } }, 404));
    await expect(verifyNip05(PUBKEY, 'alice@example.com')).resolves.toBe('unverified');
  });

  it('is unverified on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(verifyNip05(PUBKEY, 'alice@example.com')).resolves.toBe('unverified');
  });

  it('never reads a pubkey off Object.prototype', async () => {
    // `names["constructor"]` is a function on a plain object; without an
    // own-property check that is a value the comparison has to handle.
    fetchMock.mockResolvedValue(jsonResponse({ names: {} }));
    await expect(verifyNip05(PUBKEY, 'constructor@example.com')).resolves.toBe('unverified');
  });

  it('matches the pubkey case-insensitively and tries the lowercased name', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ names: { alice: PUBKEY.toUpperCase() } }));
    await expect(verifyNip05(PUBKEY, 'Alice@example.com')).resolves.toBe('verified');
  });

  it('does not fetch for a malformed identifier or pubkey', async () => {
    await expect(verifyNip05(PUBKEY, 'not an identifier')).resolves.toBe('unverified');
    await expect(verifyNip05('nothex', 'alice@example.com')).resolves.toBe('unverified');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('times out a domain that never answers, as unverified', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const pending = verifyNip05(PUBKEY, 'alice@example.com');
    expect(peekNip05(PUBKEY, 'alice@example.com')).toBe('checking');
    await vi.advanceTimersByTimeAsync(6000);
    await expect(pending).resolves.toBe('unverified');
  });
});

describe('cache', () => {
  it('answers a second call from the cache without fetching again', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ names: { alice: PUBKEY } }));
    await verifyNip05(PUBKEY, 'alice@example.com');
    await expect(verifyNip05(PUBKEY, 'alice@example.com')).resolves.toBe('verified');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(peekNip05(PUBKEY, 'alice@example.com')).toBe('verified');
  });

  it('shares one request between concurrent callers', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ names: { alice: PUBKEY } }));
    const results = await Promise.all([
      verifyNip05(PUBKEY, 'alice@example.com'),
      verifyNip05(PUBKEY, 'alice@example.com'),
    ]);
    expect(results).toEqual(['verified', 'verified']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caches negative results too, for a shorter time', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse({ names: { alice: OTHER } }));
    await verifyNip05(PUBKEY, 'alice@example.com');
    await verifyNip05(PUBKEY, 'alice@example.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(NIP05_UNVERIFIED_TTL_MS + 1);
    expect(peekNip05(PUBKEY, 'alice@example.com')).toBe('unchecked');
    await verifyNip05(PUBKEY, 'alice@example.com');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('re-checks a positive result after its TTL', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse({ names: { alice: PUBKEY } }));
    await verifyNip05(PUBKEY, 'alice@example.com');
    vi.advanceTimersByTime(NIP05_UNVERIFIED_TTL_MS + 1);
    // Still inside the positive TTL: served from cache.
    await verifyNip05(PUBKEY, 'alice@example.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(NIP05_VERIFIED_TTL_MS);
    await verifyNip05(PUBKEY, 'alice@example.com');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('is bounded: the least recently used pair is evicted first', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ names: {} })));
    for (let i = 0; i < NIP05_CACHE_MAX; i++) {
      await verifyNip05(PUBKEY, `user${i}@example.com`);
    }
    expect(nip05CacheSize()).toBe(NIP05_CACHE_MAX);
    // Touch the oldest so it becomes the most recent.
    expect(peekNip05(PUBKEY, 'user0@example.com')).toBe('unverified');
    await verifyNip05(PUBKEY, 'overflow@example.com');
    expect(nip05CacheSize()).toBe(NIP05_CACHE_MAX);
    expect(peekNip05(PUBKEY, 'user0@example.com')).toBe('unverified');
    expect(peekNip05(PUBKEY, 'user1@example.com')).toBe('unchecked');
  });

  it('keys on the pair, so the same name is not shared across pubkeys', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ names: { alice: PUBKEY } }));
    await verifyNip05(PUBKEY, 'alice@example.com');
    expect(peekNip05(OTHER, 'alice@example.com')).toBe('unchecked');
  });

  it('accepts a resolution established by a user-typed lookup', () => {
    recordNip05Resolution(PUBKEY, 'alice@example.com');
    expect(peekNip05(PUBKEY, 'alice@example.com')).toBe('verified');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('peekNip05', () => {
  it('is unchecked when nothing is known and never fetches', () => {
    expect(peekNip05(PUBKEY, 'alice@example.com')).toBe('unchecked');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is unverified for a string that cannot be an identifier', () => {
    expect(peekNip05(PUBKEY, 'verified ✓')).toBe('unverified');
  });

  it('is unchecked without a pubkey or identifier', () => {
    expect(peekNip05(null, 'alice@example.com')).toBe('unchecked');
    expect(peekNip05(PUBKEY, null)).toBe('unchecked');
  });
});


describe('cache invalidation', () => {
  it('preserves subscribers and rejects stale completions without removing a newer request', async () => {
    const { invalidateRuntimeCaches } = await import('@/services/local-data/runtime-caches');
    const responses: Array<(value: Response) => void> = [];
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => responses.push(resolve)));
    const listener = vi.fn();
    const unsubscribe = subscribeNip05(listener);
    try {
      const old = verifyNip05(PUBKEY, 'alice@example.com');
      invalidateRuntimeCaches({ categories: ['profiles'] });
      expect(peekNip05(PUBKEY, 'alice@example.com')).toBe('unchecked');
      const current = verifyNip05(PUBKEY, 'alice@example.com');
      responses[0](jsonResponse({ names: { alice: PUBKEY } }));
      expect(await old).toBe('unchecked');
      expect(peekNip05(PUBKEY, 'alice@example.com')).toBe('checking');
      responses[1](jsonResponse({ names: { alice: PUBKEY } }));
      expect(await current).toBe('verified');
      expect(peekNip05(PUBKEY, 'alice@example.com')).toBe('verified');
      expect(listener).toHaveBeenCalledTimes(4);
    } finally { unsubscribe(); }
  });
});
