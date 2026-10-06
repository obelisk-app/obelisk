'use client';

import { useCallback } from 'react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n';

/**
 * Switch language: go to the same page in the other locale, keeping the
 * query and hash (`/app?relay=…` stays on that relay). next-intl writes the
 * `locale` cookie as part of the navigation, so the choice sticks for the
 * unprefixed URLs too.
 */
export function useSwitchLocale(): (next: Locale) => void {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  return useCallback((next: Locale) => {
    if (next === locale) return;
    const suffix = typeof window === 'undefined' ? '' : `${window.location.search}${window.location.hash}`;
    router.replace(`${pathname}${suffix}`, { locale: next, scroll: false });
  }, [locale, pathname, router]);
}
