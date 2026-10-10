import { describe, expect, it } from 'vitest';
import {
  normalizePreferences,
} from '@/schemas/preferences/preferences';
import { DEFAULTS } from '@/constants/preferences/defaults';

describe('preferences schema', () => {
  it.each([null, undefined, false, 42, 'bad data', []])('defaults malformed stored input: %j', (value) => {
    expect(normalizePreferences(value)).toEqual(DEFAULTS);
  });

  it('fills every field from defaults when storage is empty', () => {
    expect(normalizePreferences({})).toEqual(DEFAULTS);
  });

  it('drops values of the wrong type or outside the allowed set', () => {
    const raw = {
      notificationSounds: 'yes',
      notificationRingtone: 'klaxon',
      callsFrom: 'strangers',
      callIpProtection: 'sometimes',
    };
    const prefs = normalizePreferences(raw);
    expect(prefs.notificationSounds).toBe(DEFAULTS.notificationSounds);
    expect(prefs.notificationRingtone).toBe(DEFAULTS.notificationRingtone);
    expect(prefs.callsFrom).toBe(DEFAULTS.callsFrom);
    expect(prefs.callIpProtection).toBe(DEFAULTS.callIpProtection);
  });

  it('reads the legacy profileFeedRelays key when socialRelays is absent', () => {
    const legacy = ['wss://a.example', 'wss://b.example', 'wss://c.example'];
    const raw = { profileFeedRelays: legacy };
    expect(normalizePreferences(raw).socialRelays).toEqual(expect.arrayContaining(legacy));
  });

});
