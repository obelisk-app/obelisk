'use client';

import { useSyncExternalStore } from 'react';
import { APPEARANCE_DEFAULTS } from '@/constants/preferences/appearance';
import { getAppearancePreferences, subscribeAppearance } from '@/services/preferences/appearance';

export function useAppearancePreferences() {
  return useSyncExternalStore(subscribeAppearance, getAppearancePreferences, () => APPEARANCE_DEFAULTS);
}
