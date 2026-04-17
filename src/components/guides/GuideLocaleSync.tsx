'use client';

import { useEffect } from 'react';
import type { Locale } from '@/i18n';
import { useTranslation } from '@/i18n/context';

/**
 * Keeps the global (cookie-backed) locale in sync with the URL-scoped locale
 * of a guide route. When someone arrives at /guides/en/... from an external
 * link, the Navbar toggle and any other cookie-driven UI should reflect the
 * language they are actually reading — without asking them to click twice.
 */
export default function GuideLocaleSync({ locale }: { locale: Locale }) {
  const { locale: current, setLocale } = useTranslation();
  useEffect(() => {
    if (current !== locale) setLocale(locale);
  }, [current, locale, setLocale]);
  return null;
}
