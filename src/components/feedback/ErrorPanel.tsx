'use client';

import Button from '@/components/ui/buttons/Button';
import TextButton from '@/components/ui/buttons/TextButton';
import { useErrorPanel } from '@/hooks/feedback/useErrorPanel';

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
 * and the copy is the `errors` module's three files, read with next-intl's
 * context-free `createTranslator` in `useErrorPanel`. The other imports are
 * that hook and the `Button` primitives (plain markup, no context, no
 * store), none with module-level side effects.
 */
export default function ErrorPanel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
}) {
  const vm = useErrorPanel(error);
  const t = vm.t;

  return (
    <div
      data-testid="error-panel"
      className="flex min-h-screen w-full items-center justify-center bg-lc-black px-4 py-10 text-lc-white"
    >
      <div className="lc-card w-full max-w-lg p-6 sm:p-8">
        <h1 className="text-xl font-semibold sm:text-2xl">{t('panel.title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-lc-muted">{t('panel.body')}</p>
        {vm.code && (
          <p className="mt-3 text-sm leading-relaxed text-lc-white" data-testid="error-panel-reason">
            {t(`codes.${vm.code}`)}
          </p>
        )}

        {vm.detail && (
          <details className="mt-5 rounded-xl border border-lc-border bg-lc-black/60">
            <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-lc-muted">
              {t('panel.details')}
            </summary>
            <pre
              data-testid="error-panel-detail"
              className="overflow-x-auto whitespace-pre-wrap break-words px-4 pb-3 text-xs text-lc-muted"
            >
              {vm.detail}
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
            onClick={vm.reload}
            data-testid="error-reload"
          >
            {t('panel.reload')}
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-lc-border pt-4 text-xs">
          <TextButton tone="muted"
            onClick={vm.clearCache}
            disabled={vm.clearedCount !== null}
            data-testid="error-clear-cache"
          >
            {vm.clearedCount === null ? t('panel.clear') : t('panel.clearing')}
          </TextButton>
          <TextButton tone="muted"
            onClick={vm.goHome}
            data-testid="error-home"
          >
            {t('panel.home')}
          </TextButton>
        </div>

        {vm.clearedCount !== null && (
          <p className="mt-3 text-xs text-lc-green" data-testid="error-cleared-note">
            {t('panel.cleared', { count: vm.clearedCount })}
          </p>
        )}
      </div>
    </div>
  );
}
