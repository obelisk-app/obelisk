import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { APPEARANCE_DEFAULTS, APPEARANCE_STORAGE_KEY, LEGACY_PREFERENCES_STORAGE_KEY } from '@/constants/preferences/appearance';

describe('appearance ownership', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });
  afterEach(() => vi.restoreAllMocks());

  it('migrates legacy colors before general preferences can overwrite them', async () => {
    localStorage.setItem(LEGACY_PREFERENCES_STORAGE_KEY, JSON.stringify({ accentColor: ' #ABCDEF ', bubbleAnimation: 'orbit', notificationSounds: false }));
    const general = await import('@/services/preferences/preferences');
    general.setPreference('notificationSounds', true);
    const appearance = await import('@/services/preferences/appearance');
    expect(appearance.getAppearancePreferences()).toMatchObject({ accentColor: '#abcdef', bubbleAnimation: 'orbit' });
    expect(general.getPreferences()).not.toHaveProperty('accentColor');
    expect(JSON.parse(localStorage.getItem(LEGACY_PREFERENCES_STORAGE_KEY)!)).not.toHaveProperty('accentColor');
    appearance.resetAppearancePreferences();
    expect(general.getPreferences().notificationSounds).toBe(true);
    vi.resetModules();
    expect((await import('@/services/preferences/appearance')).getAppearancePreferences()).toEqual(APPEARANCE_DEFAULTS);
  });

  it('keeps a stable snapshot and notifies only appearance subscribers on real changes', async () => {
    const store = await import('@/services/preferences/appearance');
    const general = await import('@/services/preferences/preferences');
    const listener = vi.fn();
    const unsubscribe = store.subscribeAppearance(listener);
    try {
      const before = store.getAppearancePreferences();
      const writes = vi.spyOn(Storage.prototype, 'setItem');
      general.setPreference('notificationSounds', false);
      writes.mockClear();
      store.setAppearancePreference('accentColor', before.accentColor);
      expect(store.getAppearancePreferences()).toBe(before);
      expect(listener).not.toHaveBeenCalled();
      expect(writes).not.toHaveBeenCalled();
      store.setAppearancePreference('accentColor', '#123456');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY)!)).toMatchObject({ accentColor: '#123456' });
    } finally { unsubscribe(); }
  });

  it('accepts cross-tab changes without echoing writes, and resets on deletion or clear', async () => {
    const store = await import('@/services/preferences/appearance');
    const listener = vi.fn();
    const unsubscribe = store.subscribeAppearance(listener);
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    try {
      window.dispatchEvent(new StorageEvent('storage', { key: APPEARANCE_STORAGE_KEY, newValue: JSON.stringify({ accentColor: '#123456' }), storageArea: localStorage }));
      expect(store.getAppearancePreferences().accentColor).toBe('#123456');
      window.dispatchEvent(new StorageEvent('storage', { key: APPEARANCE_STORAGE_KEY, newValue: '{bad' }));
      expect(store.getAppearancePreferences()).toEqual(APPEARANCE_DEFAULTS);
      window.dispatchEvent(new StorageEvent('storage', { key: APPEARANCE_STORAGE_KEY, newValue: JSON.stringify({ bubbleAnimation: 'orbit' }) }));
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
      expect(store.getAppearancePreferences()).toEqual(APPEARANCE_DEFAULTS);
      expect(writes).not.toHaveBeenCalled();
      window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: '{}' }));
      expect(listener).toHaveBeenCalledTimes(4);
    } finally { unsubscribe(); }
    window.dispatchEvent(new StorageEvent('storage', { key: APPEARANCE_STORAGE_KEY, newValue: JSON.stringify({ bubbleAnimation: 'orbit' }) }));
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('keeps live settings usable when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const store = await import('@/services/preferences/appearance');
    store.setAppearancePreference('accentColor', '#123456');
    expect(store.getAppearancePreferences().accentColor).toBe('#123456');
    store.resetAppearancePreferences();
    expect(store.getAppearancePreferences()).toEqual(APPEARANCE_DEFAULTS);
  });
});
