import { describe, it, expect } from 'vitest';
import { t } from './i18n';

describe('i18n', () => {
  it('returns the Spanish value for a known key', () => {
    expect(t('search.filters.title', 'es')).toBe('Filtros');
  });

  it('returns the English value for a known key', () => {
    expect(t('search.filters.title', 'en')).toBe('Filters');
  });

  it('falls back to English when a locale is missing a key', () => {
    // no simulated missing key in es, but unknown locale falls back to English
    // @ts-expect-error testing fallback
    expect(t('search.filters.title', 'fr')).toBe('Filters');
  });

  it('returns the key itself when neither dictionary has it', () => {
    expect(t('non.existent.key')).toBe('non.existent.key');
  });
});
