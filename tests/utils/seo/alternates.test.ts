import { describe, expect, it } from 'vitest';
import { HREFLANG, OG_LOCALE, absoluteUrl, languageAlternates, localizedAlternates, ogLocales } from '@/utils/seo/alternates';

describe('canonical and hreflang', () => {
  it('the canonical is the page in its own language, absolute, without a trailing slash', () => {
    expect(localizedAlternates('en', '/').canonical).toBe('https://obelisk.ar');
    expect(localizedAlternates('es', '/').canonical).toBe('https://obelisk.ar/es');
    expect(localizedAlternates('pt', '/guides/vesta').canonical).toBe('https://obelisk.ar/pt/guides/vesta');
    for (const l of ['en', 'es', 'pt'] as const) expect(absoluteUrl(l, '/help')).not.toMatch(/\/$|\?/);
  });

  it('hreflang is the plain language: one Spanish and one Portuguese version serve every country', () => {
    expect(HREFLANG).toEqual({ en: 'en', es: 'es', pt: 'pt' });
    expect(languageAlternates('/features')).toEqual({
      en: 'https://obelisk.ar/features',
      es: 'https://obelisk.ar/es/features',
      pt: 'https://obelisk.ar/pt/features',
      'x-default': 'https://obelisk.ar/features',
    });
  });

  it('the three versions list the same alternates, so each confirms the others', () => {
    const sets = (['en', 'es', 'pt'] as const).map((l) => localizedAlternates(l, '/guides').languages);
    expect(sets[1]).toEqual(sets[0]);
    expect(sets[2]).toEqual(sets[0]);
  });

  it('og:locale names the variety the copy is written in, with the other two as alternates', () => {
    expect(OG_LOCALE).toEqual({ en: 'en_US', es: 'es_AR', pt: 'pt_BR' });
    expect(ogLocales('es')).toEqual({ locale: 'es_AR', alternateLocale: ['en_US', 'pt_BR'] });
  });
});
