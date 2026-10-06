import { describe, expect, it } from 'vitest';
import { placeholderIn, wrongLanguage } from '../../../scripts/seo/lib/language';
import { isAllowed, parseRobots } from '../../../scripts/seo/lib/robots-checks';
import { imageSize } from '../../../scripts/seo/lib/image-size';
import { parseHead, isNoindex } from '../../../scripts/seo/lib/head';
import { abs, expectedLastmod, guideFrontMatter, splitLocale } from '../../../scripts/seo/lib/expect';

describe('language check', () => {
  it('flags English in a Spanish or Portuguese page, and Spanish in an English one', () => {
    expect(wrongLanguage('The Discord alternative for your community, with no email', 'es')).toBe('en');
    expect(wrongLanguage('La alternativa a Discord para tu comunidad, sin email', 'en')).toBe('es');
    expect(wrongLanguage('Ajuda com o Obelisk para você: grupos e zaps sem senha', 'en')).toBe('pt');
  });

  it('lets brand and protocol terms, and short labels, through', () => {
    expect(wrongLanguage('Obelisk', 'es')).toBeNull();
    expect(wrongLanguage('Chat grupal NIP-29 sobre Nostr con zaps Lightning', 'es')).toBeNull();
  });

  it('finds raw message keys and unfilled arguments', () => {
    expect(placeholderIn('seo.site.title')).toBe('seo.site.title');
    expect(placeholderIn('{name} on Obelisk')).toBe('{name}');
    expect(placeholderIn('Visit obelisk.ar today')).toBeNull();
  });
});

describe('robots.txt matching (Google rules: longest match wins, Allow on a tie)', () => {
  const { rules, sitemaps, unknown } = parseRobots('User-Agent: *\nAllow: /\nDisallow: /api/\nDisallow: /dev/\n\nHost: x\nSitemap: https://obelisk.ar/sitemap.xml\n');
  it('parses the star group, the sitemap and anything non-standard', () => {
    expect(sitemaps).toEqual(['https://obelisk.ar/sitemap.xml']);
    expect(unknown).toEqual(['host']);
  });
  it('blocks the API and the harness, nothing else', () => {
    expect(isAllowed(rules, '/api/link-preview')).toBe(false);
    expect(isAllowed(rules, '/dev/game-shots')).toBe(false);
    expect(isAllowed(rules, '/es/guides/vesta')).toBe(true);
    expect(isAllowed(rules, '/apis')).toBe(true);
  });
});

describe('image size from header bytes', () => {
  it('reads a PNG', () => {
    const png = Buffer.alloc(24);
    png.writeUInt32BE(0x89504e47, 0);
    png.writeUInt32BE(1200, 16);
    png.writeUInt32BE(630, 20);
    expect(imageSize(png)).toEqual({ width: 1200, height: 630 });
    expect(imageSize(Buffer.from('not an image'))).toBeNull();
  });
});

describe('head parsing', () => {
  it('reads lang, title, canonical, hreflang, robots, social tags and JSON-LD', () => {
    const head = parseHead(`<html lang="es"><head><title>T</title><link rel="canonical" href="https://obelisk.ar/es">
      <link rel="alternate" hreflang="x-default" href="https://obelisk.ar"><meta name="robots" content="noindex, follow">
      <meta property="og:url" content="https://obelisk.ar/es"><script type="application/ld+json">{"a":1}</script>
      <script type="application/ld+json">{bad</script></head><body><p>Hola</p><script>var x</script></body></html>`);
    expect(head.lang).toBe('es');
    expect(head.titles).toEqual(['T']);
    expect(head.canonicals).toEqual(['https://obelisk.ar/es']);
    expect(head.alternates).toEqual([{ hreflang: 'x-default', href: 'https://obelisk.ar' }]);
    expect(isNoindex(head)).toBe(true);
    expect(head.meta.get('og:url')).toEqual(['https://obelisk.ar/es']);
    expect(head.jsonLd[0].data).toEqual({ a: 1 });
    expect(head.jsonLd[1].error).toBeTruthy();
    expect(head.bodyText.trim()).toBe('Hola');
  });
});

describe('expectations', () => {
  it('maps paths and URLs between languages', () => {
    expect(abs('en', '/')).toBe('https://obelisk.ar');
    expect(abs('pt', '/guides')).toBe('https://obelisk.ar/pt/guides');
    expect(splitLocale('/es')).toEqual({ locale: 'es', path: '/' });
    expect(splitLocale('/es/guides/x')).toEqual({ locale: 'es', path: '/guides/x' });
    expect(splitLocale('/espresso')).toEqual({ locale: 'en', path: '/espresso' });
  });

  it('expects a guide lastmod from its front matter and none for a static page', () => {
    expect(expectedLastmod('es', '/guides/vesta')).toBe(guideFrontMatter('es', 'vesta').updatedAt);
    expect(expectedLastmod('en', '/features')).toBeNull();
  });
});
