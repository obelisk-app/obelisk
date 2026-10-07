'use client';

/**
 * The app settings, one section per entry in the settings sidebar. The
 * desktop `UserPanel` shows one at a time; `PreferencesPanel` stacks them
 * for surfaces with no sidebar (the phone's preferences screen).
 */
import { setPreference } from '@/services/preferences/preferences';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { setDmOptInEnabled } from '@/services/chat/dm/opt-in';
import WotSettings from '@/components/settings/privacy/WotSettings';
import LanguagePreference from '@/components/settings/appearance/LanguagePreference';
import AppearancePreferenceControls from '@/components/settings/appearance/AppearancePreferenceControls';
import NotificationSettings from '@/components/settings/notifications/NotificationSettings';
import SocialRelaySettings from '@/components/settings/social-relays/SocialRelaySettings';
import CallSettings from '@/components/settings/notifications/CallSettings';
import WalletSettings from '@/components/settings/wallet/WalletSettings';
import MutedAndBlocked from '@/components/settings/privacy/MutedAndBlocked';
import AccountBackupExport from '@/components/settings/account/AccountBackupExport';
import DeveloperSignatureTest from '@/components/settings/account/DeveloperSignatureTest';
import { useTranslations } from 'next-intl';
import type { SettingsSection } from '@/utils/settings/open-settings';
import { LocalDataSection } from './LocalDataSection';
import { PostQuantumStatusRow } from './PostQuantumStatusRow';
import { ToggleRow } from './ToggleRow';

export type SettingsTab = SettingsSection;

export function GeneralSettingsSection() {
  const prefs = usePreferences();
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <LanguagePreference />
      <ToggleRow
        label={t('settings.preferences.activity.label')}
        description={t('settings.preferences.activity.description')}
        checked={prefs.showActivityIndicator}
        onChange={(v) => setPreference('showActivityIndicator', v)}
      />
    </div>
  );
}

export function AppearanceSettingsSection() {
  return <AppearancePreferenceControls />;
}

export function NotificationsSettingsSection() {
  return <NotificationSettings />;
}

export function RelaysSettingsSection() {
  return <SocialRelaySettings />;
}

export function PrivacySettingsSection() {
  const prefs = usePreferences();
  const t = useTranslations();
  return (
    <div className="space-y-5">
      <ToggleRow
        label={t('settings.preferences.directMessages.label')}
        description={t('settings.preferences.directMessages.description')}
        checked={prefs.directMessagesEnabled}
        onChange={setDmOptInEnabled}
      />
      <div>
        <ToggleRow
          label={t('settings.postQuantum')}
          description={t('settings.postQuantumHint')}
          checked={prefs.postQuantumEnabled}
          onChange={(v) => setPreference('postQuantumEnabled', v)}
        />
        <PostQuantumStatusRow />
      </div>
      <CallSettings />
      <MutedAndBlocked />
      <WotSettings />
    </div>
  );
}

export function WalletSettingsSection() {
  return <WalletSettings />;
}

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

/**
 * Every app section stacked - for surfaces with no sidebar. The desktop
 * settings modal shows one section at a time instead.
 */
export function PreferencesPanel() {
  return (
    <div className="space-y-8 p-4">
      <GeneralSettingsSection />
      <AppearanceSettingsSection />
      <NotificationsSettingsSection />
      <RelaysSettingsSection />
      <PrivacySettingsSection />
      <WalletSettingsSection />
      <LocalDataSection />
      <AdvancedSettingsSection />
    </div>
  );
}
