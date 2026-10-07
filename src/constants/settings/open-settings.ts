/**
 * Settings: open settings. Values the code in
 * `services/settings/open-settings.ts` reads, kept here so every reader
 * imports the one copy.
 */

import type { SettingsSection } from '@/services/settings/open-settings';

export const OPEN_SETTINGS_EVENT = 'obelisk:open-settings';

export const SETTINGS_SECTIONS: ReadonlyArray<SettingsSection> = [
  'profile', 'general', 'appearance', 'notifications', 'relays', 'privacy', 'wallet', 'media', 'data', 'advanced',
];

/**
 * The anchor the relay settings block carries, so a shell that opens the
 * preferences tab can scroll it into view rather than dumping the reader at
 * the top of a long panel.
 */
export const RELAY_SETTINGS_ANCHOR = 'obelisk-relay-settings';
