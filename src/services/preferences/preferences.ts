'use client';

import { createLocalStore } from '@/services/common/local-store';
import { normalizePreferenceValue, normalizePreferences } from '@/schemas/preferences/preferences';
import type { Preferences } from '@/types/preferences/preferences';
import { loadAppearancePreferences } from './appearance-storage';

export { normalizeCallRelays } from '@/schemas/preferences/preferences';
export type { CallIpProtection, CallsFrom, NotificationRingtone, Preferences } from '@/types/preferences/preferences';
export { DEFAULTS as PREFERENCE_DEFAULTS, CALL_RELAY_MAX, DEFAULT_CALL_RELAYS } from '@/constants/preferences/defaults';
// Preserve legacy colors before the general store next saves without them.
loadAppearancePreferences();

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

/** Non-React change listener. Returns an unsubscribe. */
export function subscribePreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
