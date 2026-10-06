'use client';

import { useEffect } from 'react';
import { getAppearanceCssVariables } from '@/services/preferences';
import { usePreferences } from '@/hooks/usePreferences';

export default function AppearancePreferencesRoot() {
  const prefs = usePreferences();

  useEffect(() => {
    const root = document.documentElement;
    const vars = getAppearanceCssVariables(prefs);
    for (const [name, value] of Object.entries(vars)) {
      root.style.setProperty(name, value);
    }
    root.dataset.bubbleAnimation = prefs.bubbleAnimation;
  }, [prefs]);

  return null;
}
