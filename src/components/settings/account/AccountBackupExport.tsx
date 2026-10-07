'use client';

import { useTranslations } from 'next-intl';
import { useAccountBackupExport } from '@/hooks/settings/account/useAccountBackupExport';

export default function AccountBackupExport({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslations();
  const { status, message, working, download } = useAccountBackupExport();

  return (
    <div>
      <button
        type="button"
        className={mobile
          ? 'settings-row action'
          : 'flex w-full items-center justify-between rounded-lg border border-lc-border bg-lc-black p-4 text-left hover:border-lc-green/50 disabled:opacity-60'}
        onClick={download}
        disabled={working}
        data-testid={mobile ? 'mobile-download-backup' : 'desktop-download-backup'}
      >
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className={mobile ? '' : 'block text-sm font-semibold text-lc-white'}>
            {working ? t('settings.preferences.backup.working') : t('settings.preferences.backup.action')}
          </span>
          <span className={mobile ? 'settings-row-meta muted' : 'mt-1 block text-xs text-lc-muted'} style={mobile ? { display: 'block', maxWidth: '100%', marginTop: 3 } : undefined}>
            {t('settings.preferences.backup.description')}
          </span>
        </span>
        <span className={mobile ? 'settings-row-meta muted' : 'text-lc-muted'} aria-hidden="true">↓</span>
      </button>
      {message && (
        <p className={mobile ? 'px-4 py-2 text-xs' : 'mt-2 px-1 text-xs'} role={status === 'error' ? 'alert' : 'status'}>
          {message}
        </p>
      )}
    </div>
  );
}
