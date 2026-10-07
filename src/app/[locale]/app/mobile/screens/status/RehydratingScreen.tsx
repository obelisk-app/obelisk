'use client';

import { useTranslations } from 'next-intl';

/** Shown while a stored session reconnects, instead of telling the user they are logged out. */
export function RehydratingScreen() {
  const t = useTranslations();
  return (
    <div className="screen active">
      <div className="conn-screen">
        <div className="conn-spinner" />
        <div style={{ color: 'var(--app-text-dim)', fontSize: 13 }}>{t('common.reconnecting')}</div>
      </div>
    </div>
  );
}
