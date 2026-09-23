'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  acceptLanguageToLocale,
  getTranslation,
  isLocale,
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALES,
  type Locale,
} from './index';
import { useLocaleStore } from '@/store/locale';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLocale(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE;

  // Built from LOCALES rather than a literal alternation: the next language
  // should not need an edit here, and a stale list silently ignores a valid
  // cookie and falls back to the default.
  const cookieMatch = document.cookie.match(
    new RegExp(`(?:^|; )${LOCALE_COOKIE}=(${LOCALES.join('|')})`),
  );
  if (isLocale(cookieMatch?.[1])) return cookieMatch[1] as Locale;

  try {
    const stored = localStorage.getItem(LOCALE_COOKIE);
    if (isLocale(stored)) return stored;
  } catch {}

  const browserLanguages = typeof navigator === 'undefined' ? null : navigator.languages?.join(',') || navigator.language;
  return acceptLanguageToLocale(browserLanguages ?? null) ?? DEFAULT_LOCALE;
}

export function LocaleProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale || getInitialLocale);

  useEffect(() => {
    useLocaleStore.getState().setLocale(locale);
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    useLocaleStore.getState().setLocale(l);
    document.cookie = `${LOCALE_COOKIE}=${l};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    try { localStorage.setItem(LOCALE_COOKIE, l); } catch {}
  }, []);

  const t = getTranslation(locale);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation must be used within a LocaleProvider');
  return ctx;
}
