/**
 * The `[locale]` segment, read by a server layout, page or
 * `generateMetadata`: a value that is not one of ours is a 404 (so
 * `/fr/app` does not render English under a French URL), and the locale is
 * handed to next-intl for the rest of the request.
 */

import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { isLocale, type Locale } from './index';

export type LocaleParams<P extends Record<string, string> = Record<never, string>> = {
  params: Promise<P & { locale: string }>;
};

export async function pageLocale(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return locale;
}
