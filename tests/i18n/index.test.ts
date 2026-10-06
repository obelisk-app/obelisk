import { describe, it, expect } from 'vitest';
import {
  countryToLocale,
  acceptLanguageToLocale,
  detectLocale,
  LATAM_COUNTRIES,
  DEFAULT_LOCALE,
} from '@/i18n/index';

describe('countryToLocale', () => {
  it('returns "es" for LATAM countries', () => {
    expect(countryToLocale('AR')).toBe('es');
    expect(countryToLocale('MX')).toBe('es');
    expect(countryToLocale('CO')).toBe('es');
    expect(countryToLocale('ES')).toBe('es');
  });

  it('returns "pt" for Portuguese-speaking countries', () => {
    // Brazil used to land on English: it is not in the LATAM set, and the
    // fallback was binary.
    expect(countryToLocale('BR')).toBe('pt');
    expect(countryToLocale('PT')).toBe('pt');
    expect(countryToLocale('AO')).toBe('pt');
    expect(countryToLocale('MZ')).toBe('pt');
  });

  it('returns "en" for everywhere else', () => {
    expect(countryToLocale('US')).toBe('en');
    expect(countryToLocale('GB')).toBe('en');
    expect(countryToLocale('DE')).toBe('en');
  });

  it('handles lowercase country codes', () => {
    expect(countryToLocale('ar')).toBe('es');
    expect(countryToLocale('us')).toBe('en');
    expect(countryToLocale('br')).toBe('pt');
  });

  it('returns the default locale (en) when country is null', () => {
    expect(countryToLocale(null)).toBe('en');
  });

  it('default locale is "en": English lives at the unprefixed URLs', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('LATAM_COUNTRIES includes key countries', () => {
    expect(LATAM_COUNTRIES.has('AR')).toBe(true);
    expect(LATAM_COUNTRIES.has('MX')).toBe(true);
    expect(LATAM_COUNTRIES.has('CL')).toBe(true);
    expect(LATAM_COUNTRIES.has('US')).toBe(false);
  });
});


describe('acceptLanguageToLocale', () => {
  it('uses the highest-priority supported language', () => {
    expect(acceptLanguageToLocale('en-US,en;q=0.8,es;q=0.7')).toBe('en');
    expect(acceptLanguageToLocale('fr-FR,es-AR;q=0.9,en;q=0.4')).toBe('es');
  });

  it('accepts Portuguese in any regional flavour', () => {
    // Both pt-BR and pt-PT resolve to the one Portuguese we ship.
    expect(acceptLanguageToLocale('fr-FR,pt-BR;q=0.9')).toBe('pt');
    expect(acceptLanguageToLocale('pt-PT')).toBe('pt');
  });

  it('returns null when no supported language is present', () => {
    expect(acceptLanguageToLocale('fr-FR,de-DE;q=0.9')).toBeNull();
    expect(acceptLanguageToLocale(null)).toBeNull();
  });
});

describe('detectLocale', () => {
  it('keeps an explicit cookie locale ahead of geo and browser hints', () => {
    expect(detectLocale({ cookieLocale: 'es', countryCode: 'US', acceptLanguage: 'en-US' })).toBe('es');
    expect(detectLocale({ cookieLocale: 'en', countryCode: 'AR', acceptLanguage: 'es-AR' })).toBe('en');
  });

  it('uses country before Accept-Language when there is no cookie', () => {
    expect(detectLocale({ countryCode: 'AR', acceptLanguage: 'en-US' })).toBe('es');
    expect(detectLocale({ countryCode: 'US', acceptLanguage: 'es-AR' })).toBe('en');
  });

  it('falls back to Accept-Language and then the default locale', () => {
    expect(detectLocale({ acceptLanguage: 'es-AR,es;q=0.9' })).toBe('es');
    expect(detectLocale({ acceptLanguage: 'fr-FR' })).toBe(DEFAULT_LOCALE);
  });
});
