'use client';

import { AdvancedSettingsSection } from './AdvancedSettingsSection';
import AppearancePreferenceControls from '@/components/settings/appearance/AppearancePreferenceControls';
import { GeneralSettingsSection } from './GeneralSettingsSection';
import LocalDataPanel from '@/components/settings/privacy/LocalDataPanel';
import NotificationSettings from '@/components/settings/notifications/NotificationSettings';
import { PrivacySettingsSection } from './PrivacySettingsSection';
import SocialRelaySettings from '@/components/settings/social-relays/SocialRelaySettings';
import WalletSettings from '@/components/settings/wallet/WalletSettings';

/**
 * Every app section stacked - for surfaces with no sidebar. The desktop
 * settings modal shows one section at a time instead.
 */
export function PreferencesPanel() {
  return (
    <div className="space-y-8 p-4">
      <GeneralSettingsSection />
      <AppearancePreferenceControls />
      <NotificationSettings />
      <SocialRelaySettings />
      <PrivacySettingsSection />
      <WalletSettings />
      <LocalDataPanel />
      <AdvancedSettingsSection />
    </div>
  );
}
