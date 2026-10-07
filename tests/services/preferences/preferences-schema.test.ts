import { describe, expect, it } from 'vitest';
import {
  normalizePreferenceValue,
  normalizePreferences,
  sanitizeHexColor,
} from '@/services/preferences/preferences-schema';
import { DEFAULTS } from '@/constants/preferences/preferences-schema';

describe('preferences-schema', () => {
  it('fills every field from defaults when storage is empty', () => {
    expect(normalizePreferences({})).toEqual(DEFAULTS);
  });

  it('drops values of the wrong type or outside the allowed set', () => {
    const raw = {
      notificationSounds: 'yes',
      notificationRingtone: 'klaxon',
      callsFrom: 'strangers',
      callIpProtection: 'sometimes',
      accentColor: 'red',
    } as unknown as Parameters<typeof normalizePreferences>[0];
    const prefs = normalizePreferences(raw);
    expect(prefs.notificationSounds).toBe(DEFAULTS.notificationSounds);
    expect(prefs.notificationRingtone).toBe(DEFAULTS.notificationRingtone);
    expect(prefs.callsFrom).toBe(DEFAULTS.callsFrom);
    expect(prefs.callIpProtection).toBe(DEFAULTS.callIpProtection);
    expect(prefs.accentColor).toBe(DEFAULTS.accentColor);
  });

  it('reads the legacy profileFeedRelays key when socialRelays is absent', () => {
    const legacy = ['wss://a.example', 'wss://b.example', 'wss://c.example'];
    const raw = { profileFeedRelays: legacy } as unknown as Parameters<typeof normalizePreferences>[0];
    expect(normalizePreferences(raw).socialRelays).toEqual(expect.arrayContaining(legacy));
  });

  it('normalises a single colour key and lowercases a valid hex', () => {
    expect(normalizePreferenceValue('accentColor', ' #ABCDEF ')).toBe('#abcdef');
    expect(normalizePreferenceValue('accentColor', '#abc')).toBe(DEFAULTS.accentColor);
    expect(sanitizeHexColor(42, '#000000')).toBe('#000000');
  });
});
