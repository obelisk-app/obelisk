import { useEffect, useState, useSyncExternalStore } from 'react';
import { createTranslator } from 'next-intl';
import { clearAllClientCacheExceptSession } from '@/services/local-data/cache-clear';
import { errorCodeOf } from '@/utils/errors/codes';
import en from '@/i18n/messages/en/errors.json';
import es from '@/i18n/messages/es/errors.json';
import pt from '@/i18n/messages/pt/errors.json';

/**
 * The recovery panel's view model. Provider-free like the panel itself (see
 * `src/components/feedback/ErrorPanel.tsx`): the locale comes off
 * `<html lang>` and the copy is the `errors` module's three files read with
 * next-intl's context-free `createTranslator`. Nothing here may need a
 * provider, a store or the bridge.
 */

export type PanelLocale = 'en' | 'es' | 'pt';

const MESSAGES = { en, es, pt } satisfies Record<PanelLocale, typeof en>;

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

/** `<html lang>` is fixed for the life of the document: nothing to watch. */
const subscribeToNothing = () => () => {};
// Mirrors i18n's DEFAULT_LOCALE, duplicated on purpose: importing the
// routing config would pull the rest of the i18n setup into the error
// chunk, and the panel's whole contract is that it loads and renders with
// nothing else available.
const serverLocale = (): PanelLocale => 'en';

export function useErrorPanel(error: Error & { digest?: string }) {
  // `useSyncExternalStore` (rather than state + effect) so the server
  // snapshot and the client snapshot are declared separately: SSR renders
  // the default locale, the client reads `<html lang>`, and React
  // reconciles the difference itself instead of flashing one then the
  // other through a post-mount setState.
  const locale = useSyncExternalStore(subscribeToNothing, readPanelLocale, serverLocale);
  const [clearedCount, setClearedCount] = useState<number | null>(null);

  // Next.js swallows the original error in production builds, so without
  // this the console shows only a digest and the stack is unrecoverable.
  useEffect(() => {
    console.error('[obelisk] render error boundary caught:', error);
  }, [error]);

  return {
    t: createTranslator({ locale, messages: MESSAGES[locale] }),
    code: errorCodeOf(error),
    detail: errorPanelDetail(error),
    clearedCount,
    reload: () => window.location.reload(),
    /**
     * A hard navigation, not next/link: client-side routing would carry the
     * broken JS state into the landing page, and the router is exactly what
     * cannot be assumed healthy here.
     */
    goHome: () => { window.location.href = errorPanelHome(locale); },
    clearCache: () => {
      let removed = 0;
      try {
        removed = clearAllClientCacheExceptSession();
      } catch {
        // Never block recovery on the wipe; reload regardless.
      }
      setClearedCount(removed);
      // Let the "cleared N" line paint before the navigation kills it.
      setTimeout(() => window.location.reload(), 400);
    },
  };
}
