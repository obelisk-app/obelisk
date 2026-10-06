/**
 * Render helpers for components that read copy through next-intl.
 *
 * `LocaleProvider` keeps the name the old in-house provider had, so a test
 * still writes `<LocaleProvider initialLocale="en">`; underneath it is a
 * `NextIntlClientProvider` with every module of that language. A missing
 * key or a message rendered without its ICU arguments throws, so a test
 * fails where the browser would show the raw key.
 */

import type { ReactNode } from 'react';
import { NextIntlClientProvider, type IntlError } from 'next-intl';
import { createTranslator } from 'next-intl';
import type { Locale } from '@/i18n';
import type { Translate } from '@/i18n/keys';
import { allMessages } from './messages';

function fail(error: IntlError): void {
  throw error;
}

export function LocaleProvider({ children, initialLocale = 'en' }: { children: ReactNode; initialLocale?: Locale }) {
  return (
    <NextIntlClientProvider locale={initialLocale} messages={allMessages(initialLocale)} onError={fail} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}

/** A plain translator for non-React assertions: `translator('es')('common.save')`. */
export function translator(locale: Locale = 'en'): Translate {
  return createTranslator({ locale, messages: allMessages(locale), onError: fail }) as unknown as Translate;
}
