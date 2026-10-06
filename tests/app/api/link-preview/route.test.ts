// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lookup = vi.fn();
vi.mock('node:dns/promises', () => ({ default: { lookup: (...a: unknown[]) => lookup(...a) } }));

import { GET } from '@/app/api/link-preview/route';
import { RATE_LIMIT, rateLimited } from '@/services/server/link-preview/rate-limit';

const page = (body: string) => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });
const ask = (url: string, ip = '203.0.113.9') =>
  GET(new Request(`https://obelisk.ar/api/link-preview?url=${encodeURIComponent(url)}`, { headers: { 'cf-connecting-ip': ip } }));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  lookup.mockReset();
  lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('GET /api/link-preview', () => {
  it('unfurls a page and serves the second ask from the cache', async () => {
    fetchMock.mockResolvedValueOnce(page('<meta property="og:title" content="Hello"><title>x</title>'));
    const first = await ask('https://example.com/cached', '198.51.100.1');
    expect(first.status).toBe(200);
    expect((await first.json()).title).toBe('Hello');
    const second = await ask('https://example.com/cached', '198.51.100.1');
    expect(second.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caches a failure too, so a dead or blocked URL is not refetched', async () => {
    const first = await ask('http://127.0.0.1/admin', '198.51.100.2');
    expect(first.status).toBe(404);
    const second = await ask('http://127.0.0.1/admin', '198.51.100.2');
    expect(second.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a missing url, a malformed one, and a non-http scheme', async () => {
    expect((await GET(new Request('https://obelisk.ar/api/link-preview', { headers: { 'cf-connecting-ip': '198.51.100.3' } }))).status).toBe(400);
    expect((await ask('not a url', '198.51.100.3')).status).toBe(400);
    expect((await ask('file:///etc/passwd', '198.51.100.3')).status).toBe(400);
  });

  it('answers 429 once an IP spends its budget', async () => {
    fetchMock.mockImplementation(async () => page('<title>t</title>'));
    for (let i = 0; i < RATE_LIMIT; i += 1) {
      expect((await ask(`https://example.com/n${i}`, '198.51.100.4')).status).not.toBe(429);
    }
    expect((await ask('https://example.com/over', '198.51.100.4')).status).toBe(429);
  });
});

describe('rateLimited', () => {
  it('allows RATE_LIMIT requests per window, then refuses until the window resets', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    for (let i = 0; i < RATE_LIMIT; i += 1) expect(rateLimited('192.0.2.50')).toBe(false);
    expect(rateLimited('192.0.2.50')).toBe(true);
    expect(rateLimited('192.0.2.51')).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(rateLimited('192.0.2.50')).toBe(false);
  });
});
