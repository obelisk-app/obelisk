'use client';

/**
 * `formatDate`/`formatTime`/`formatNumber` bound to the app's current
 * language, so a component never has to pass the locale itself and,
 * more to the point, never has the option of forgetting to.
 *
 * Sits beside `useTranslations()` rather than inside it: plenty of
 * components format a timestamp without having any copy to translate.
 */

import { useMemo } from 'react';
import { useLocale } from 'next-intl';
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatTime,
} from '@/utils/format/format';

export function useFormat() {
  const locale = useLocale();
  return useMemo(() => ({
    locale,
    formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) =>
      formatDate(locale, value, options),
    formatTime: (value: Date | number, options?: Intl.DateTimeFormatOptions) =>
      formatTime(locale, value, options),
    formatDateTime: (value: Date | number, options?: Intl.DateTimeFormatOptions) =>
      formatDateTime(locale, value, options),
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) =>
      formatNumber(locale, value, options),
  }), [locale]);
}
