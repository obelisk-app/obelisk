'use client';

import { AdvancedSettingsSection } from './AdvancedSettingsSection';
import { AppearanceSettingsSection } from './AppearanceSettingsSection';
import { GeneralSettingsSection } from './GeneralSettingsSection';
import { LocalDataSection } from './LocalDataSection';
import { NotificationsSettingsSection } from './NotificationsSettingsSection';
import { PrivacySettingsSection } from './PrivacySettingsSection';
import { RelaysSettingsSection } from './RelaysSettingsSection';
import { WalletSettingsSection } from './WalletSettingsSection';

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
