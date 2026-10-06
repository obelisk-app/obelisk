'use client';

import { useTranslations } from 'next-intl';
import type { ScreenName } from '@/utils/shell/mobile/url-state';

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

/** A sub-screen whose target is missing (no channel, no peer): one way home. */
export function EmptyScreen({ go, title }: { go: (s: ScreenName) => void; title: string }) {
  const t = useTranslations();
  return (
    <div className="screen active">
      <div className="empty-state">
        <div className="empty-state-title">{title}</div>
        <button className="btn-primary" style={{ width: 'auto', padding: '10px 18px' }} onClick={() => go('server')}>
          {t('mobile.empty.backHome')}
        </button>
      </div>
    </div>
  );
}
