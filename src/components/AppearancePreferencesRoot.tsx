'use client';

import { useEffect } from 'react';
import { getAppearanceCssVariables, usePreferences } from '@/lib/preferences';

export default function AppearancePreferencesRoot() {
  const prefs = usePreferences();

  useEffect(() => {
    const root = document.documentElement;
    const vars = getAppearanceCssVariables(prefs);
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
  }, [prefs]);

  return null;
}
