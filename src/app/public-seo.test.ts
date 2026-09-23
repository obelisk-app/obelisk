import { describe, expect, it, vi } from 'vitest';

// `generateMetadata` reads the request locale, so the headers/cookies it
// calls have to exist. English keeps the assertions readable; the point of
// the test is the shape of the metadata, not which language it is in.
vi.mock('next/headers', () => ({
  headers: async () => new Map([['x-obelisk-locale', 'en']]) as unknown as Headers,
  cookies: async () => ({ get: () => undefined }),
}));

import { generateMetadata as featuresMetadata } from './features/page';
import { metadata as help } from './help/layout';

describe('public page SEO metadata', () => {
  it.each([
    ['features', featuresMetadata, '/features'],
  ])('%s has unique canonical and social metadata', async (_name, load, canonical) => {
    const metadata = await load();
    expect(metadata.title).toBeTruthy();
    expect(metadata.description).toBeTruthy();
    expect(metadata.alternates?.canonical).toBe(canonical);
    expect(metadata.openGraph?.images).toBeTruthy();
    expect(metadata.twitter?.images).toBeTruthy();
  });

  it('help still declares its own canonical and social cards', () => {
    expect(help.title).toBeTruthy();
    expect(help.description).toBeTruthy();
    expect(help.alternates?.canonical).toBe('/help');
    expect(help.openGraph?.images).toBeTruthy();
    expect(help.twitter?.images).toBeTruthy();
  });

  it('translates the metadata rather than serving one hardcoded language', async () => {
    // The regression this guards: `export const metadata = {…}` is evaluated
    // once at module load, so it cannot depend on who is asking. Every field
    // below used to be a literal English string for a Portuguese reader too.
    const { getTranslation } = await import('@/i18n');
    const metadata = await featuresMetadata();
    expect(metadata.title).toBe(getTranslation('en')('features.meta.title'));
  });
});
