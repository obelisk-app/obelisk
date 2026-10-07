'use client';

import { setPreference } from '@/services/preferences/preferences';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import AccountBackupExport from '@/components/settings/account/AccountBackupExport';
import DeveloperSignatureTest from '@/components/settings/account/DeveloperSignatureTest';
import { useTranslations } from 'next-intl';
import { ToggleRow } from './ToggleRow';

export function AdvancedSettingsSection() {
  const prefs = usePreferences();
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <section className="space-y-2 rounded-lg border border-lc-border bg-lc-dark/30 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-lc-muted">
          {t("settings.preferences.backup.advanced")}
        </h3>
        <AccountBackupExport />
      </section>
      <section className="space-y-3 border-t border-lc-border pt-4" data-testid="desktop-developer-settings">
        <div className="text-xs font-semibold uppercase tracking-wider text-lc-muted">{t('settings.developer.section')}</div>
        <ToggleRow
          label={t('settings.developer.relayLogs')}
          description={t('settings.developer.relayLogsHelp')}
          checked={prefs.developerRelayDebug}
          onChange={(v) => setPreference('developerRelayDebug', v)}
        />
        <DeveloperSignatureTest />
      </section>
    </div>
  );
}
