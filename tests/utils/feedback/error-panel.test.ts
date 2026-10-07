import { afterEach, describe, expect, it } from 'vitest';
import { errorPanelDetail, errorPanelHome, readPanelLocale } from '@/utils/feedback/error-panel';

afterEach(() => { document.documentElement.lang = ''; });

describe('error panel helpers', () => {
  it('reads es and pt off <html lang> and falls back to en', () => {
    document.documentElement.lang = 'pt';
    expect(readPanelLocale()).toBe('pt');
    document.documentElement.lang = 'fr';
    expect(readPanelLocale()).toBe('en');
  });

  it('joins the message and the digest', () => {
    expect(errorPanelDetail(Object.assign(new Error('boom'), { digest: 'x1' }))).toBe('boom\ndigest: x1');
    expect(errorPanelDetail(new Error(''))).toBe('');
  });

  it('sends English home to the bare landing and the others to their prefix', () => {
    expect(errorPanelHome('en')).toBe('/');
    expect(errorPanelHome('es')).toBe('/es');
  });
});
