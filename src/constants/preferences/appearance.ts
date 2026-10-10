import type { AppearancePreferences } from '@/types/preferences/appearance';

export const APPEARANCE_STORAGE_KEY = 'obelisk:appearance';
export const LEGACY_PREFERENCES_STORAGE_KEY = 'obelisk:preferences';
export const APPEARANCE_DEFAULTS: Readonly<AppearancePreferences> = {
  accentColor: '#b4f953',
  backgroundColor: '#0a0a0a',
  buttonColor: '#b4f953',
  bubbleColor: '#b4f953',
  bubbleAnimation: 'float',
};
