import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lookup = vi.hoisted(() => vi.fn());
vi.mock('node:dns/promises', () => ({ default: { lookup } }));

import { GET } from './route';

const MAX_AVATAR_BYTES = 1024 * 1024;

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const req = (url: string, ip = '203.0.113.9') =>
  new Request(`https://obelisk.test/api/avatar?url=${encodeURIComponent(url)}`, { headers: { 'cf-connecting-ip': ip } });

let n = 0;
const unique = () => `https://img.example/${n++}.png`;

beforeEach(() => {
  lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});
afterEach(() => vi.unstubAllGlobals());

describe('/api/avatar', () => {
  it('returns a raster image with nosniff and a sandbox CSP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(png, { headers: { 'content-type': 'image/png' } })));
    const res = await GET(req(unique()));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain('sandbox');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(png);
  });

  it('refuses SVG and anything that is not an image', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })));
    expect((await GET(req(unique()))).status).toBe(404);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { headers: { 'content-type': 'text/html' } })));
    expect((await GET(req(unique()))).status).toBe(404);
  });

  it('refuses private addresses, directly and after a redirect', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect((await GET(req('http://127.0.0.1/admin.png'))).status).toBe(404);
    lookup.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);
    expect((await GET(req('https://intranet.example/a.png'))).status).toBe(404);
    expect(f).not.toHaveBeenCalled();

    lookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    f.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } }));
    expect((await GET(req(unique()))).status).toBe(404);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('refuses images over the size cap', async () => {
    const big = new Uint8Array(MAX_AVATAR_BYTES + 1);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(big, { headers: { 'content-type': 'image/jpeg' } })));
    expect((await GET(req(unique()))).status).toBe(404);
  });

  it('rejects non-http URLs and missing parameters', async () => {
    expect((await GET(new Request('https://obelisk.test/api/avatar'))).status).toBe(400);
    expect((await GET(req('file:///etc/passwd'))).status).toBe(400);
    expect((await GET(req('javascript:alert(1)'))).status).toBe(400);
  });

  it('rate-limits one client', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(png, { headers: { 'content-type': 'image/png' } })));
    let last = 200;
    for (let i = 0; i < 125; i++) last = (await GET(req(unique(), '198.51.100.7'))).status;
    expect(last).toBe(429);
  });
});
