'use client';

import { useEffect } from 'react';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { getAppearanceCssVariables } from '@/services/preferences/preferences-appearance';

/** Apply saved appearance without repainting for unrelated preference changes. */
export function useAppearancePreferencesRoot(): void {
  const { accentColor, backgroundColor, buttonColor, bubbleColor, bubbleAnimation } = usePreferences();
  useEffect(() => {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(getAppearanceCssVariables({ accentColor, backgroundColor, buttonColor, bubbleColor }))) {
      root.style.setProperty(name, value);
    }
  }, [accentColor, backgroundColor, buttonColor, bubbleColor]);
  useEffect(() => {
    document.documentElement.dataset.bubbleAnimation = bubbleAnimation;
  }, [bubbleAnimation]);
}
