import { beforeEach, describe, expect, it } from 'vitest';
import { LOCALE_STORE_VERSION, useLocaleStore } from '@/store/locale';
import { defaultLocale } from '@/utils/i18n';
import { CORRUPT_STATES, readBlob, seedBlob } from './persist-blob';

const KEY = 'obelisk:locale';

function load(state: unknown, version: number): void {
  seedBlob(KEY, state, version);
  void useLocaleStore.persist.rehydrate();
}

describe('locale store saved-data migrations', () => {
  beforeEach(() => {
    localStorage.clear();
    useLocaleStore.setState({ locale: defaultLocale });
  });

  it('a version 0 blob keeps the chosen language and is saved back under the current version', () => {
    load({ locale: 'pt' }, 0);
    expect(useLocaleStore.getState().locale).toBe('pt');
    expect(readBlob(KEY)).toEqual({ state: { locale: 'pt' }, version: LOCALE_STORE_VERSION });
  });

  it('a language this build does not ship falls back to the default', () => {
    load({ locale: 'fr' }, 0);
    expect(useLocaleStore.getState().locale).toBe(defaultLocale);
  });

  it.each(CORRUPT_STATES)('falls back to the defaults on %s', (_label, state, version) => {
    useLocaleStore.setState({ locale: 'en' });
    expect(() => load(state, version)).not.toThrow();
    expect(useLocaleStore.getState().locale).toBe(defaultLocale);
  });

  it('unparseable JSON leaves the language as it was instead of throwing', () => {
    useLocaleStore.setState({ locale: 'en' });
    localStorage.setItem(KEY, '{"state":');
    expect(() => void useLocaleStore.persist.rehydrate()).not.toThrow();
    expect(useLocaleStore.getState().locale).toBe('en');
  });
});
