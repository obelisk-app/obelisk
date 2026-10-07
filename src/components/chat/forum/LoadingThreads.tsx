'use client';

import { useTranslations } from 'next-intl';

export function LoadingThreads() {
  const t = useTranslations();
  return (
    <div
      className="flex flex-col items-center justify-center h-full text-center text-lc-muted py-12 gap-3"
      data-testid="threads-loading"
    >
      <div className="lc-spinner" aria-hidden="true" />
      <div className="text-sm">{t('chat.forum.loading')}</div>
    </div>
  );
}
