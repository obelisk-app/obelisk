'use client';

/**
 * The app settings, one section per entry in the settings sidebar, each in
 * its own file. The desktop `UserPanel` shows one at a time;
 * `PreferencesPanel` stacks them for surfaces with no sidebar (the phone's
 * preferences screen).
 */
import type { SettingsSection } from '@/utils/settings/open-settings';

export type SettingsTab = SettingsSection;

export { GeneralSettingsSection } from './GeneralSettingsSection';
export { AppearanceSettingsSection } from './AppearanceSettingsSection';
export { NotificationsSettingsSection } from './NotificationsSettingsSection';
export { RelaysSettingsSection } from './RelaysSettingsSection';
export { PrivacySettingsSection } from './PrivacySettingsSection';
export { WalletSettingsSection } from './WalletSettingsSection';
export { AdvancedSettingsSection } from './AdvancedSettingsSection';
export { PreferencesPanel } from './PreferencesPanel';
