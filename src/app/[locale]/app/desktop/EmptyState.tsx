'use client';

import { useTranslations } from 'next-intl';

/** The "pick a channel" main pane. Relay and AUTH state live in the activity stack, not here. */
export function EmptyState() {
  const t = useTranslations();
  return (
    <div className="flex h-full items-center justify-center text-lc-muted">
      <div className="text-center">
        <div className="text-lg font-medium text-lc-white">{t('shell.desktop.empty.title')}</div>
        <div className="mt-1 text-sm">{t('shell.desktop.empty.description')}</div>
      </div>
    </div>
  );
}
