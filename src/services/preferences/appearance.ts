'use client';

import { APPEARANCE_DEFAULTS, APPEARANCE_STORAGE_KEY } from '@/constants/preferences/appearance';
import { normalizeAppearance } from '@/schemas/preferences/appearance';
import type { AppearancePreferences } from '@/types/preferences/appearance';
import { loadAppearancePreferences, saveAppearancePreferences } from './appearance-storage';

let current = loadAppearancePreferences();
const listeners = new Set<() => void>();

function update(value: AppearancePreferences): boolean {
  if (Object.keys(APPEARANCE_DEFAULTS).every((key) => current[key as keyof AppearancePreferences] === value[key as keyof AppearancePreferences])) return false;
  current = value;
  listeners.forEach((listener) => listener());
  return true;
}

function onStorage(event: StorageEvent): void {
  if (event.storageArea !== null && event.storageArea !== localStorage) return;
  if (event.key !== null && event.key !== APPEARANCE_STORAGE_KEY) return;
  // Deleting this key (or clearing storage) resets appearance, without reviving legacy settings.
  try { update(normalizeAppearance(event.newValue === null ? null : JSON.parse(event.newValue))); }
  catch { update(APPEARANCE_DEFAULTS); }
}

export function getAppearancePreferences(): AppearancePreferences { return current; }

export function setAppearancePreference<K extends keyof AppearancePreferences>(key: K, value: AppearancePreferences[K]): void {
  const next = normalizeAppearance({ ...current, [key]: value });
  if (update(next)) saveAppearancePreferences(current);
}

export function resetAppearancePreferences(): void {
  update(APPEARANCE_DEFAULTS);
  saveAppearancePreferences(current);
}

export function subscribeAppearance(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}
