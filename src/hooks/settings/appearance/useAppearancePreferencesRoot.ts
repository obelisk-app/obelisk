'use client';

import { useEffect } from 'react';
import { getAppearancePreferences, subscribeAppearance } from '@/services/preferences/appearance';
import { applyAppearance } from '@/services/preferences/appearance-dom';

/** Subscribe once; theme updates do not rerender the application tree. */
export function useAppearancePreferencesRoot(): void {
  useEffect(() => {
    const paint = () => applyAppearance(document.documentElement, getAppearancePreferences());
    const unsubscribe = subscribeAppearance(paint);
    paint();
    return unsubscribe;
  }, []);
}
