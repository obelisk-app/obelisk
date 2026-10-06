'use client';

import { useSyncExternalStore } from 'react';
import {
  getPreferences,
  PREFERENCE_DEFAULTS,
  subscribePreferences,
  type Preferences,
} from '@/services/preferences';

/** The persisted app settings, re-rendering on every change. The server snapshot is the defaults. */
export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribePreferences, getPreferences, () => PREFERENCE_DEFAULTS);
}
