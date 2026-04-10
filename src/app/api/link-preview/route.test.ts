import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function makeRequest(url?: string) {
  const searchParams = new URLSearchParams();
  if (url) searchParams.set('url', url);
  return new NextRequest(`http://localhost:3000/api/link-preview?${searchParams}`);
}

describe('GET /api/link-preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when url param is missing', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid URL', async () => {
    const res = await GET(makeRequest('not-a-url'));
    expect(res.status).toBe(400);
  });

  it('returns 403 for private IPs (SSRF protection)', async () => {
    const res = await GET(makeRequest('http://localhost:8080/secret'));
    expect(res.status).toBe(403);
  });

  it('returns 403 for 192.168.x.x', async () => {
    const res = await GET(makeRequest('http://192.168.1.1/admin'));
    expect(res.status).toBe(403);
  });

  it('fetches and returns OG data', async () => {
    const html = `
      <html><head>
        <meta property="og:title" content="Test Page">
        <meta property="og:description" content="A test description">
        <meta property="og:site_name" content="TestSite">
      </head></html>
    `;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'text/html' }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(html));
          controller.close();
        },
      }),
    });

    const res = await GET(makeRequest('https://unique-og-test.com'));
    const data = await res.json();
    expect(data.title).toBe('Test Page');
    expect(data.description).toBe('A test description');
    expect(data.siteName).toBe('TestSite');
  });

  it('returns empty object for non-HTML responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: null,
    });

    const res = await GET(makeRequest('https://api-only-test.com'));
    const data = await res.json();
    expect(data.title).toBeUndefined();
  });
});
