'use client';

import { useSyncExternalStore } from 'react';
import { createLocalStore } from './local-store';

export interface Preferences {
  showActivityIndicator: boolean;
}

const DEFAULTS: Preferences = {
  showActivityIndicator: true,
};

const store = createLocalStore<Partial<Preferences>>('obelisk:preferences', {});
let current: Preferences = { ...DEFAULTS, ...store.load() };
const listeners = new Set<() => void>();

export function getPreferences(): Preferences {
  return current;
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  if (current[key] === value) return;
  current = { ...current, [key]: value };
  store.save(current);
  listeners.forEach((l) => l());
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => DEFAULTS,
  );
}
