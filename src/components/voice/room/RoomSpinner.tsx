'use client';

import { useTranslations } from 'next-intl';

/** The room's loading spinner. */
export default function RoomSpinner() {
  const t = useTranslations();
  return <div className="w-6 h-6 border-2 border-neutral-700 border-t-lc-green rounded-full animate-spin mx-auto" aria-label={t('common.loading')} />;
}
