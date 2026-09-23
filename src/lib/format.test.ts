import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatNumber, formatTime, intlLocale } from './format';

/**
 * The bug these guard against is invisible in English on an English
 * machine: `toLocaleDateString()` with no argument follows the *operating
 * system*, so the app's language picker had no effect on any date in the
 * product, in any language, before or after Portuguese existed.
 */
describe('formatting in the app’s language', () => {
  it('maps our locale union onto the BCP-47 tags we publish', () => {
    expect(intlLocale('en')).toBe('en-US');
    expect(intlLocale('es')).toBe('es-AR');
    expect(intlLocale('pt')).toBe('pt-BR');
  });

  it('formats the same instant differently per language', () => {
    const when = new Date(Date.UTC(2026, 2, 14, 15, 30));
    expect(formatDate('en', when, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }))
      .toBe('March 14, 2026');
    expect(formatDate('es', when, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }))
      .toBe('14 de marzo de 2026');
    expect(formatDate('pt', when, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }))
      .toBe('14 de março de 2026');
  });

  it('groups numbers the way each language does', () => {
    // Sats totals: a dot and a comma mean opposite things in en-US and es-AR.
    expect(formatNumber('en', 21000)).toBe('21,000');
    expect(formatNumber('es', 21000)).toBe('21.000');
    expect(formatNumber('pt', 21000)).toBe('21.000');
  });

  it('takes Nostr seconds or JavaScript milliseconds', () => {
    // Nostr timestamps are seconds; half the call sites had already
    // multiplied by 1000 and half had not.
    const seconds = Math.floor(Date.UTC(2026, 2, 14, 15, 30) / 1000);
    const opts = { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' } as const;
    expect(formatTime('en', seconds, opts)).toBe(formatTime('en', seconds * 1000, opts));
  });

  it('formats a date and time together', () => {
    const when = Date.UTC(2026, 2, 14, 15, 30);
    expect(formatDateTime('en', when, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
    })).toContain('Mar 14');
  });
});
