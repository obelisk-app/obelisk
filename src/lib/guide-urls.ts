import type { Locale } from '@/i18n';

/**
 * English is the default locale and has no URL prefix.
 * Spanish is served under /guides/es.
 */
export function guidesHref(locale: Locale, slug?: string): string {
  const base = locale === 'en' ? '/guides' : '/guides/es';
  return slug ? `${base}/${slug}` : base;
}
