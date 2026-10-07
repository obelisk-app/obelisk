'use client';

import { useEffect } from 'react';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { applyAppearance } from '@/services/settings/apply-appearance';

/** Keep the page root painted with the saved appearance, repainting on every change. */
export function useAppearancePreferencesRoot(): void {
  const prefs = usePreferences();
  useEffect(() => {
    applyAppearance(document.documentElement, prefs);
  }, [prefs]);
}
