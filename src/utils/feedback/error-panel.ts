/**
 * The recovery panel's pure parts: its language (off `<html lang>`, no
 * provider needed), the details line and where "home" goes. Read by
 * `useErrorPanel`; nothing here may need a provider, a store or the bridge.
 */

export type PanelLocale = 'en' | 'es' | 'pt';

/** Locale off `<html lang>`, set by the root layout, no provider needed. */
export function readPanelLocale(): PanelLocale {
  if (typeof document === 'undefined') return 'en';
  const lang = document.documentElement.lang;
  return lang === 'es' || lang === 'pt' ? lang : 'en';
}

/** The message and digest, one per line, for the details block. */
export function errorPanelDetail(error: (Error & { digest?: string }) | undefined): string {
  return [error?.message, error?.digest && `digest: ${error.digest}`].filter(Boolean).join('\n');
}

/** Where "home" goes: the bare landing for English, the locale prefix otherwise. */
export function errorPanelHome(locale: PanelLocale): string {
  return locale === 'en' ? '/' : `/${locale}`;
}
