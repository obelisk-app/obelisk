'use client';

import { useState } from 'react';
import { setPreference } from '@/services/preferences/preferences';

export type AppearanceColorKey = 'accentColor' | 'backgroundColor' | 'buttonColor' | 'bubbleColor';

/**
 * One colour row: the text box keeps whatever is being typed, and a whole
 * `#rrggbb` is saved as soon as it is one. A new saved value (a reset, or a
 * change made on another surface) replaces the draft in the same render.
 */
export function useColorPreferenceRow(key: AppearanceColorKey, value: string) {
  const [draft, setDraft] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);
  if (syncedValue !== value) {
    setSyncedValue(value);
    setDraft(value);
  }

  const commit = (next: string) => {
    setDraft(next);
    if (/^#[0-9a-f]{6}$/i.test(next)) setPreference(key, next.toLowerCase());
  };

  return { draft, commit };
}
