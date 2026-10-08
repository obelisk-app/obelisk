import { describe, expect, it } from 'vitest';
import { noindexMetadata, pageMetadata, renderedTitle } from '@/utils/seo/page';
import { NOINDEX, X_HANDLE } from '@/constants/seo/page';
import { excerpt } from '@/utils/seo/og';

const image = { url: 'https://obelisk.ar/og/cards/es/help.png', width: 1200, height: 630, type: 'image/png', alt: 'Tarjeta: Ayuda' };

describe('pageMetadata: an indexed page', () => {
  const m = pageMetadata({ locale: 'es', path: '/help', title: 'Ayuda', description: 'Ayuda con Obelisk.', image });
  const og = m.openGraph as Record<string, unknown>;

  it('carries its canonical, every alternate, and an og:url equal to the canonical', () => {
    expect(m.alternates?.canonical).toBe('https://obelisk.ar/es/help');
    expect(Object.keys(m.alternates?.languages ?? {}).sort()).toEqual(['en', 'es', 'pt', 'x-default']);
    expect(og.url).toBe(m.alternates?.canonical);
  });

  it('the card says what the tab and the result say: the rendered title and the meta description', () => {
    expect(m.title).toBe('Ayuda');
    expect(og).toMatchObject({ type: 'website', siteName: 'Obelisk', locale: 'es_AR', title: 'Ayuda · Obelisk', description: 'Ayuda con Obelisk.' });
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', site: X_HANDLE, title: 'Ayuda · Obelisk', description: 'Ayuda con Obelisk.' });
    expect(m.robots).toBeUndefined();
  });

  it('shows the card it is given, on the open graph and the twitter card alike', () => {
    expect(og.images).toEqual([image]);
    expect((m.twitter as { images: unknown }).images).toEqual([{ url: image.url, alt: 'Tarjeta: Ayuda' }]);
  });

  it('an article carries its dates as given, and the landing page can skip the title template', () => {
    const a = pageMetadata({ locale: 'en', path: '/guides/x', title: 'X', description: 'd', image, type: 'article', article: { publishedTime: '2026-04-16', modifiedTime: '2026-10-06', tags: ['nostr'] } });
    expect(a.openGraph).toMatchObject({ type: 'article', publishedTime: '2026-04-16', modifiedTime: '2026-10-06', tags: ['nostr'] });
    const home = pageMetadata({ locale: 'en', path: '/', title: 'Home', absoluteTitle: true, description: 'd', image });
    expect(home.title).toEqual({ absolute: 'Home' });
    expect((home.openGraph as { title: string }).title).toBe('Home');
    expect(renderedTitle('X')).toBe('X · Obelisk');
  });
});

describe('noindexMetadata: a page kept out of search', () => {
  it('says noindex, follow and carries no canonical or hreflang to contradict it', () => {
    const m = noindexMetadata({ locale: 'pt', path: '/r/lacrypta', title: 'La Crypta', description: 'd', image });
    expect(m.robots).toEqual(NOINDEX);
    expect(NOINDEX).toEqual({ index: false, follow: true });
    expect(m.alternates).toBeUndefined();
  });

  it('still unfurls: og:url is its own URL, with the full card', () => {
    const m = noindexMetadata({ locale: 'pt', path: '/r/lacrypta', title: 'La Crypta', image });
    expect((m.openGraph as Record<string, unknown>).url).toBe('https://obelisk.ar/pt/r/lacrypta');
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', site: X_HANDLE, title: 'La Crypta · Obelisk' });
  });
});

describe('excerpt (user text on a card)', () => {
  it('keeps short text and cuts long text at a word', () => {
    expect(excerpt('  hello   world ', 20)).toBe('hello world');
    expect(excerpt('one two three four five six seven', 16)).toBe('one two three…');
  });
});
