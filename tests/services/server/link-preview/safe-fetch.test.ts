import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The endpoint fetches URLs an anonymous user chose. These pin the guards
 * that keep it off the private network: they must keep failing a request
 * that reaches one.
 */
const lookup = vi.fn();
vi.mock('node:dns/promises', () => ({ default: { lookup: (...a: unknown[]) => lookup(...a) } }));

import { MAX_BYTES, MAX_REDIRECTS, assertPublicHost, safeFetch } from '@/services/server/link-preview/safe-fetch';

function html(body: string | Uint8Array[], init: { status?: number; type?: string } = {}) {
  const chunks = typeof body === 'string' ? [new TextEncoder().encode(body)] : body;
  let i = 0;
  const cancel = vi.fn(async () => {});
  return {
    status: init.status ?? 200,
    ok: (init.status ?? 200) < 300,
    headers: new Headers({ 'content-type': init.type ?? 'text/html; charset=utf-8' }),
    body: { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: chunks[i++] } : { done: true, value: undefined }), cancel }) },
    cancel,
  };
}
const redirect = (location: string) => ({ status: 302, ok: false, headers: new Headers({ location }), body: null });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  lookup.mockReset();
  lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('assertPublicHost', () => {
  it('refuses a private or loopback IP literal without a DNS lookup', async () => {
    await expect(assertPublicHost('127.0.0.1')).rejects.toThrow('blocked address');
    await expect(assertPublicHost('169.254.169.254')).rejects.toThrow('blocked address');
    expect(lookup).not.toHaveBeenCalled();
  });

  it('refuses a name when any one of its answers is private', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }]);
    await expect(assertPublicHost('mixed.example')).rejects.toThrow('blocked address');
  });

  it('refuses a name that resolves to nothing, and passes a public one', async () => {
    lookup.mockResolvedValueOnce([]);
    await expect(assertPublicHost('nothing.example')).rejects.toThrow('unresolvable');
    await expect(assertPublicHost('example.com')).resolves.toBeUndefined();
  });
});

describe('safeFetch', () => {
  it('never fetches a private address', async () => {
    await expect(safeFetch('http://127.0.0.1:7777/admin')).rejects.toThrow('blocked address');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('follows redirects by hand and refuses one that points at the private network', async () => {
    fetchMock.mockResolvedValueOnce(redirect('http://10.0.0.1/secret'));
    await expect(safeFetch('https://example.com/a')).rejects.toThrow('blocked address');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('gives up after MAX_REDIRECTS hops', async () => {
    fetchMock.mockImplementation(async () => redirect('https://example.com/loop'));
    expect(await safeFetch('https://example.com/start')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
  });

  it('only reads http(s), only HTML', async () => {
    expect(await safeFetch('ftp://example.com/x')).toBeNull();
    fetchMock.mockResolvedValueOnce(html('{}', { type: 'application/json' }));
    expect(await safeFetch('https://example.com/data')).toBeNull();
  });

  it('stops reading at MAX_BYTES and cancels the rest of the body', async () => {
    const chunk = new Uint8Array(200 * 1024).fill(97);
    const response = html([chunk, chunk, chunk, chunk, chunk]);
    fetchMock.mockResolvedValueOnce(response);
    const out = await safeFetch('https://example.com/huge');
    expect(response.cancel).toHaveBeenCalled();
    expect(out!.body.length).toBeLessThan(MAX_BYTES + chunk.length);
    expect(out!.body.length).toBeGreaterThanOrEqual(MAX_BYTES);
  });

  it('returns the page and the URL it finally landed on', async () => {
    fetchMock
      .mockResolvedValueOnce(redirect('/moved'))
      .mockResolvedValueOnce(html('<title>Hi</title>'));
    expect(await safeFetch('https://example.com/a')).toEqual({ body: '<title>Hi</title>', finalUrl: 'https://example.com/moved' });
  });
});
