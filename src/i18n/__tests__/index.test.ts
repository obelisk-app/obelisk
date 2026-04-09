import { describe, it, expect } from 'vitest';
import { getTranslation, countryToLocale, LATAM_COUNTRIES, DEFAULT_LOCALE } from '../index';

describe('getTranslation', () => {
  it('returns English strings for "en" locale', () => {
    const t = getTranslation('en');
    expect(t('hero.title')).toBe('Chat with');
    expect(t('hero.titleHighlight')).toBe('Nostr Identity');
  });

  it('returns Spanish strings for "es" locale', () => {
    const t = getTranslation('es');
    expect(t('hero.title')).toBe('Chateá con');
    expect(t('hero.titleHighlight')).toBe('Identidad Nostr');
  });

  it('returns the key itself for missing translations', () => {
    const t = getTranslation('en');
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  it('defaults to Spanish for unknown locale', () => {
    const t = getTranslation('fr' as any);
    expect(t('hero.title')).toBe('Chateá con');
  });
});

describe('countryToLocale', () => {
  it('returns "es" for LATAM countries', () => {
    expect(countryToLocale('AR')).toBe('es');
    expect(countryToLocale('MX')).toBe('es');
    expect(countryToLocale('CO')).toBe('es');
    expect(countryToLocale('ES')).toBe('es');
  });

  it('returns "en" for non-LATAM countries', () => {
    expect(countryToLocale('US')).toBe('en');
    expect(countryToLocale('GB')).toBe('en');
    expect(countryToLocale('DE')).toBe('en');
  });

  it('handles lowercase country codes', () => {
    expect(countryToLocale('ar')).toBe('es');
    expect(countryToLocale('us')).toBe('en');
  });

  it('returns default locale (es) when country is null', () => {
    expect(countryToLocale(null)).toBe('es');
  });

  it('default locale is "es"', () => {
    expect(DEFAULT_LOCALE).toBe('es');
  });

  it('LATAM_COUNTRIES includes key countries', () => {
    expect(LATAM_COUNTRIES.has('AR')).toBe(true);
    expect(LATAM_COUNTRIES.has('MX')).toBe(true);
    expect(LATAM_COUNTRIES.has('CL')).toBe(true);
    expect(LATAM_COUNTRIES.has('US')).toBe(false);
  });
});
