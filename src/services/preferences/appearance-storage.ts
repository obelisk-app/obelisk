import { APPEARANCE_DEFAULTS, APPEARANCE_STORAGE_KEY, LEGACY_PREFERENCES_STORAGE_KEY } from '@/constants/preferences/appearance';
import { normalizeAppearance } from '@/schemas/preferences/appearance';
import type { AppearancePreferences } from '@/types/preferences/appearance';

/** Also used before first paint; no React or general preference dependencies. */
export function loadAppearancePreferences(): AppearancePreferences {
  try {
    const saved = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (saved !== null) return normalizeAppearance(JSON.parse(saved));
    const legacy = localStorage.getItem(LEGACY_PREFERENCES_STORAGE_KEY);
    if (legacy !== null) {
      const raw: unknown = JSON.parse(legacy);
      const appearance = normalizeAppearance(raw);
      if (saveAppearancePreferences(appearance) && raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const remaining = { ...raw } as Record<string, unknown>;
        for (const key of Object.keys(APPEARANCE_DEFAULTS)) delete remaining[key];
        // Remove migrated fields only after their new copy is safely persisted.
        try { localStorage.setItem(LEGACY_PREFERENCES_STORAGE_KEY, JSON.stringify(remaining)); } catch { /* Best effort. */ }
      }
      return appearance;
    }
  } catch {
    // Blocked storage and malformed JSON must not prevent rendering.
  }
  return APPEARANCE_DEFAULTS;
}

export function saveAppearancePreferences(value: AppearancePreferences): boolean {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    // The live theme remains usable when persistence is unavailable.
    return false;
  }
}
