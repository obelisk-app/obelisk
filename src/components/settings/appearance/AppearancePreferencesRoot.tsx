'use client';

import { useAppearancePreferencesRoot } from '@/hooks/settings/appearance/useAppearancePreferencesRoot';

/** Renders nothing: applies the appearance preferences to the page (`useAppearancePreferencesRoot`). */
export default function AppearancePreferencesRoot() {
  useAppearancePreferencesRoot();
  return null;
}
