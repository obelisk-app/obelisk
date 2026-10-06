import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { quotaSafeLocalStorage } from '@/services/quota-safe-storage';
import { defaultLocale, supportedLocales, t, type Locale } from '@/utils/i18n';
import { oneOf, versionedPersist } from './persist-version';

interface LocaleState {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

type LocalePersisted = Pick<LocaleState, 'locale'>;

/** Saved-shape version. 0: before versioning, same field. */
export const LOCALE_STORE_VERSION = 1;

/** A locale this build no longer ships (or garbage) falls back to the default. */
export function sanitizeLocalePersisted(raw: Record<string, unknown>): LocalePersisted {
  return { locale: oneOf(raw.locale, supportedLocales) ?? defaultLocale };
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: defaultLocale,
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: 'obelisk:locale',
      storage: createJSONStorage(() => quotaSafeLocalStorage),
      partialize: (s): LocalePersisted => ({ locale: s.locale }),
      ...versionedPersist<LocaleState, LocalePersisted>({
        version: LOCALE_STORE_VERSION,
        sanitize: sanitizeLocalePersisted,
      }),
    },
  )
);

export function useT() {
  const locale = useLocaleStore((s) => s.locale);
  return (key: string) => t(key, locale);
}
