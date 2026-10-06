'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { createTranslator } from 'next-intl';
import { clearAllClientCacheExceptSession } from '@/services/cache-clear';
import { errorCodeOf } from '@/utils/errors/codes';
import Button from '@/components/ui/Button';
import TextButton from '@/components/ui/TextButton';
import en from '@/i18n/messages/en/errors.json';
import es from '@/i18n/messages/es/errors.json';
import pt from '@/i18n/messages/pt/errors.json';

/**
 * The recovery UI behind `app/error.tsx` and `app/global-error.tsx`.
 *
 * Deliberately provider-free: no `useTranslations`, no Zustand store, no
 * bridge. An error boundary that throws while rendering its own fallback
 * escalates to the next boundary up, and at the root there is none, which
 * lands the user on exactly the blank client-side-exception screen this
 * component exists to replace. So locale comes off `<html lang>` (stamped
 * by the root layout, and still readable in `global-error.tsx` where the
 * layout, and therefore the intl provider, is gone) rather than context,
 * and the copy is the `errors` module's three files, imported here
 * directly and read with next-intl's context-free `createTranslator`. The
 * other imports are a pure localStorage helper, the error-code reader and
 * the `Button` primitives (plain markup, no context, no store), none with
 * module-level side effects.
 */

type PanelLocale = 'en' | 'es' | 'pt';

const MESSAGES = { en, es, pt } satisfies Record<PanelLocale, typeof en>;

function translatorFor(locale: PanelLocale) {
  return createTranslator({ locale, messages: MESSAGES[locale] });
}

/** Locale off `<html lang>`, set by the root layout, no provider needed. */
function readLocale(): PanelLocale {
  if (typeof document === 'undefined') return 'en';
  const lang = document.documentElement.lang;
  return lang === 'es' || lang === 'pt' ? lang : 'en';
}

/** `<html lang>` is fixed for the life of the document: nothing to watch. */
const subscribeToNothing = () => () => {};
// Mirrors i18n's DEFAULT_LOCALE, duplicated on purpose: importing the
// routing config would pull the rest of the i18n setup into the error
// chunk, and this component's whole contract is that it loads and renders
// with nothing else available.
const serverLocale = (): PanelLocale => 'en';

export default function ErrorPanel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
}) {
  // `useSyncExternalStore` (rather than state + effect) so the server
  // snapshot and the client snapshot are declared separately: SSR renders
  // the default locale, the client reads `<html lang>`, and React
  // reconciles the difference itself instead of us flashing one then the
  // other through a post-mount setState.
  const locale = useSyncExternalStore(subscribeToNothing, readLocale, serverLocale);
  const [clearedCount, setClearedCount] = useState<number | null>(null);
  const t = translatorFor(locale);
  const code = errorCodeOf(error);

  // Next.js swallows the original error in production builds, so without
  // this the console shows only a digest and the stack is unrecoverable.
  useEffect(() => {
    console.error('[obelisk] render error boundary caught:', error);
  }, [error]);

  const onClear = () => {
    let removed = 0;
    try {
      removed = clearAllClientCacheExceptSession();
    } catch {
      // Never block recovery on the wipe; reload regardless.
    }
    setClearedCount(removed);
    // Let the "cleared N" line paint before the navigation kills it.
    setTimeout(() => window.location.reload(), 400);
  };

  const detail = [error?.message, error?.digest && `digest: ${error.digest}`]
    .filter(Boolean)
    .join('\n');

  return (
    <div
      data-testid="error-panel"
      className="flex min-h-screen w-full items-center justify-center bg-lc-black px-4 py-10 text-lc-white"
    >
      <div className="lc-card w-full max-w-lg p-6 sm:p-8">
        <h1 className="text-xl font-semibold sm:text-2xl">{t('panel.title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-lc-muted">{t('panel.body')}</p>
        {code && (
          <p className="mt-3 text-sm leading-relaxed text-lc-white" data-testid="error-panel-reason">
            {t(`codes.${code}`)}
          </p>
        )}

        {detail && (
          <details className="mt-5 rounded-xl border border-lc-border bg-lc-black/60">
            <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-lc-muted">
              {t('panel.details')}
            </summary>
            <pre
              data-testid="error-panel-detail"
              className="overflow-x-auto whitespace-pre-wrap break-words px-4 pb-3 text-xs text-lc-muted"
            >
              {detail}
            </pre>
          </details>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {reset && (
            <Button variant="pill" size="md" onClick={reset} data-testid="error-retry">
              {t('panel.retry')}
            </Button>
          )}
          <Button
            variant="pillSecondary"
            size="md"
            onClick={() => window.location.reload()}
            data-testid="error-reload"
          >
            {t('panel.reload')}
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-lc-border pt-4 text-xs">
          <TextButton tone="muted"
            onClick={onClear}
            disabled={clearedCount !== null}
            data-testid="error-clear-cache"
          >
            {clearedCount === null ? t('panel.clear') : t('panel.clearing')}
          </TextButton>
          {/* A hard navigation, not next/link: client-side routing would
              carry the broken JS state into the landing page, and the
              router is exactly what we cannot assume is healthy here. */}
          <TextButton tone="muted"
            onClick={() => { window.location.href = locale === 'en' ? '/' : `/${locale}`; }}
            data-testid="error-home"
          >
            {t('panel.home')}
          </TextButton>
        </div>

        {clearedCount !== null && (
          <p className="mt-3 text-xs text-lc-green" data-testid="error-cleared-note">
            {t('panel.cleared', { count: clearedCount })}
          </p>
        )}
      </div>
    </div>
  );
}
