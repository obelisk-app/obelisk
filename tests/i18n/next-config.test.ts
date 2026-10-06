import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

/**
 * The URL changes that must not quietly come undone: the old guide URLs
 * answer with a permanent redirect (their search ranking and shared links
 * carry over), and the proxy sees the request's own URL (see the comment in
 * next.config.ts: without it every unprefixed English page looped).
 */
describe('next.config.ts for URL locales', () => {
  it('redirects every old guide URL permanently to the one route tree', async () => {
    const redirects = await nextConfig.redirects!();
    const map = Object.fromEntries(redirects.map((r) => [r.source, [r.destination, r.permanent]]));
    expect(map['/guides/es']).toEqual(['/es/guides', true]);
    expect(map['/guides/pt']).toEqual(['/pt/guides', true]);
    expect(map['/guides/es/:path+']).toEqual(['/es/guides/:path+', true]);
    expect(map['/guides/pt/:path+']).toEqual(['/pt/guides/:path+', true]);
    expect(map['/guides/en']).toEqual(['/guides', true]);
    expect(map['/guides/en/:path+']).toEqual(['/guides/:path+', true]);
    expect(map['/:locale(es|pt)/chat']).toEqual(['/:locale/app', true]);
  });

  it('lets the proxy see the request URL as sent', () => {
    expect(nextConfig.skipProxyUrlNormalize).toBe(true);
  });
});
