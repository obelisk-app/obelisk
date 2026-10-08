'use client';

import Text from '@/components/ui/layout/Text';
import { setPreference } from '@/services/preferences/preferences';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import AccountBackupExport from '@/components/settings/account/AccountBackupExport';
import DeveloperSignatureTest from '@/components/settings/account/DeveloperSignatureTest';
import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import { ToggleRow } from './ToggleRow';
import Heading from '@/components/ui/layout/Heading';

export function AdvancedSettingsSection() {
  const prefs = usePreferences();
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <Card as="section" surface="subtle" radius="lg" className="space-y-2">
        <Heading as="h3" variant="label">
          {t("settings.preferences.backup.advanced")}
        </Heading>
        <AccountBackupExport />
      </Card>
      <section className="space-y-3 border-t border-lc-border pt-4" data-testid="desktop-developer-settings">
        <Text as="div" variant="label" size="xs" tone="muted" weight="semibold">{t('settings.developer.section')}</Text>
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
