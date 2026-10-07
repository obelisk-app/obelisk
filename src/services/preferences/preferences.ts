'use client';

import { createLocalStore } from '@/services/common/local-store';
import {
  normalizePreferenceValue,
  normalizePreferences,
  type Preferences,
} from './preferences-schema';
import { APPEARANCE_DEFAULTS } from '@/constants/preferences/preferences-schema';

export {
  normalizeCallRelays,
  type BubbleAnimationStyle,
  type CallIpProtection,
  type CallsFrom,
  type NotificationRingtone,
  type Preferences,
} from './preferences-schema';
export { APPEARANCE_DEFAULTS, DEFAULTS as PREFERENCE_DEFAULTS, CALL_RELAY_MAX, DEFAULT_CALL_RELAYS } from '@/constants/preferences/preferences-schema';
export { getAppearanceCssVariables } from './preferences-appearance';

const store = createLocalStore<Partial<Preferences>>('obelisk:preferences', {});
let current: Preferences = normalizePreferences(store.load());
const listeners = new Set<() => void>();

export function getPreferences(): Preferences {
  return current;
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  const normalized = normalizePreferenceValue(key, value);
  if (current[key] === normalized) return;
  current = { ...current, [key]: normalized };
  store.save(current);
  listeners.forEach((l) => l());
}

export function resetAppearancePreferences(): void {
  current = {
    ...current,
    accentColor: APPEARANCE_DEFAULTS.accentColor,
    backgroundColor: APPEARANCE_DEFAULTS.backgroundColor,
    buttonColor: APPEARANCE_DEFAULTS.buttonColor,
    bubbleColor: APPEARANCE_DEFAULTS.bubbleColor,
    bubbleAnimation: APPEARANCE_DEFAULTS.bubbleAnimation,
  };
  store.save(current);
  listeners.forEach((l) => l());
}

/** Non-React change listener. Returns an unsubscribe. */
export function subscribePreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
