import { describe, expect, it, vi } from 'vitest';

vi.mock('next/font/google', () => ({
  Inter: () => ({ className: 'inter' }),
}));

// The metadata resolves the request locale now, so the headers and cookies
// it reads have to exist.
vi.mock('next/headers', () => ({
  headers: async () => new Map([['x-obelisk-locale', 'pt']]) as unknown as Headers,
  cookies: async () => ({ get: () => undefined }),
}));

import { generateMetadata } from './layout';

describe('root social metadata', () => {
  it('uses the static Open Graph image', async () => {
    const metadata = await generateMetadata();
    expect(metadata.openGraph?.images).toEqual([{
      url: '/og/obelisk.png?v=2',
      width: 1200,
      height: 630,
      type: 'image/png',
      alt: 'Obelisk — chat em grupo com identidade Nostr',
    }]);
    expect(metadata.twitter?.images).toEqual(['/og/obelisk.png?v=2']);
  });

  it('follows the request language rather than one baked-in default', async () => {
    // The regression: a static `metadata` object is evaluated once at module
    // load, so every crawler and every reader got the same English strings —
    // and `og:locale` claimed Spanish regardless.
    const metadata = await generateMetadata();
    const { getTranslation } = await import('@/i18n');
    expect(metadata.description).toBe(getTranslation('pt')('meta.description'));
    expect(metadata.openGraph?.locale).toBe('pt_BR');
    expect(metadata.openGraph?.alternateLocale).not.toContain('pt_BR');
  });
});
