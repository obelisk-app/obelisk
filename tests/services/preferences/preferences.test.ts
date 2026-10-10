import { DEFAULT_SOCIAL_RELAYS } from '@/constants/social/relays';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('preferences store', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('persists general preferences independently of appearance', async () => {
    const { getPreferences, setPreference } = await import('@/services/preferences/preferences');

    expect(getPreferences()).toMatchObject({
      directMessagesEnabled: false,
      developerRelayDebug: false,
      // Against the constant, not a copy of it: which four relays ship as
      // the default is a config decision, and duplicating the list here
      // meant changing it failed a test about persisting colors.
      socialRelays: [...DEFAULT_SOCIAL_RELAYS],
    });

    setPreference('directMessagesEnabled', true);
    setPreference('developerRelayDebug', true);
    setPreference('socialRelays', ['wss://one.example', 'wss://two.example', 'wss://three.example']);

    expect(getPreferences()).toMatchObject({
      directMessagesEnabled: true,
      developerRelayDebug: true,
      socialRelays: ['wss://one.example', 'wss://two.example', 'wss://three.example'],
    });
    expect(JSON.parse(localStorage.getItem('obelisk:preferences') ?? '{}')).toMatchObject({
      directMessagesEnabled: true,
      developerRelayDebug: true,
      socialRelays: ['wss://one.example', 'wss://two.example', 'wss://three.example'],
    });
  });

  it('stores DM opt-in as a non-secret boolean preference', async () => {
    const { setDmOptInEnabled } = await import('@/services/chat/dm/opt-in');
    const { DM_OPT_IN_PREFERENCE_KEY, DM_OPT_IN_STORAGE_KEY } = await import('@/constants/chat/dm');

    expect(DM_OPT_IN_STORAGE_KEY).toBe('obelisk:preferences');
    expect(DM_OPT_IN_PREFERENCE_KEY).toBe('directMessagesEnabled');
    expect(`${DM_OPT_IN_STORAGE_KEY}:${DM_OPT_IN_PREFERENCE_KEY}`).not.toMatch(/session|secret|nsec|private|token/i);

    setDmOptInEnabled(true);

    const stored = JSON.parse(localStorage.getItem(DM_OPT_IN_STORAGE_KEY) ?? '{}');
    expect(stored[DM_OPT_IN_PREFERENCE_KEY]).toBe(true);
    expect(typeof stored[DM_OPT_IN_PREFERENCE_KEY]).toBe('boolean');
    expect(JSON.stringify(stored)).not.toMatch(/nsec|private|secret/i);
  });

  it('normalizes invalid persisted preferences', async () => {
    localStorage.setItem('obelisk:preferences', JSON.stringify({
      showActivityIndicator: false,
      developerRelayDebug: 'yes',
      socialRelays: ['https://bad.example', 'wss://duplicate.example', 'wss://duplicate.example'],
    }));

    const { getPreferences } = await import('@/services/preferences/preferences');
    expect(getPreferences()).toMatchObject({
      showActivityIndicator: false,
      developerRelayDebug: false,
      // One entry was invalid and two were duplicates: the good relay
      // survives instead of the whole list being thrown away.
      socialRelays: ['wss://duplicate.example'],
    });

  });

  describe('DM call preferences', () => {
    it('default to contacts-only, auto IP protection and the default call relays', async () => {
      const { getPreferences, DEFAULT_CALL_RELAYS } = await import('@/services/preferences/preferences');
      expect(getPreferences()).toMatchObject({
        callsFrom: 'contacts',
        callIpProtection: 'auto',
        callRelays: [...DEFAULT_CALL_RELAYS],
      });
    });

    it('keeps only wss relays, deduped and capped, and never an empty list', async () => {
      const { getPreferences, setPreference, DEFAULT_CALL_RELAYS, CALL_RELAY_MAX } = await import('@/services/preferences/preferences');
      setPreference('callRelays', ['wss://a.example/', 'wss://a.example', 'https://b.example', 'ws://c.example', 'wss://u:p@d.example', 'wss://e.example', 'wss://f.example', 'wss://g.example', 'wss://h.example']);
      expect(getPreferences().callRelays).toEqual(['wss://a.example', 'wss://e.example', 'wss://f.example', 'wss://g.example'].slice(0, CALL_RELAY_MAX));
      setPreference('callRelays', []);
      expect(getPreferences().callRelays).toEqual([...DEFAULT_CALL_RELAYS]);
    });

    it('falls back from junk in storage', async () => {
      localStorage.setItem('obelisk:preferences', JSON.stringify({ callsFrom: 'everyone!', callIpProtection: 7, callRelays: 'nope' }));
      const { getPreferences, DEFAULT_CALL_RELAYS } = await import('@/services/preferences/preferences');
      expect(getPreferences()).toMatchObject({ callsFrom: 'contacts', callIpProtection: 'auto', callRelays: [...DEFAULT_CALL_RELAYS] });
    });
  });

  describe('postQuantumEnabled', () => {
    // On by default: the toggle gates the conversation notice and the
    // per-message marks as well as post-quantum sending, so defaulting off
    // hid the entire feature from anyone who never opened settings.
    it('defaults to true', async () => {
      const { getPreferences } = await import('@/services/preferences/preferences');
      expect(getPreferences().postQuantumEnabled).toBe(true);
    });

    it('round-trips through setPreference', async () => {
      const { getPreferences, setPreference } = await import('@/services/preferences/preferences');
      setPreference('postQuantumEnabled', false);
      expect(getPreferences().postQuantumEnabled).toBe(false);
      setPreference('postQuantumEnabled', true);
      expect(getPreferences().postQuantumEnabled).toBe(true);
    });

    it('respects a persisted opt-out', async () => {
      localStorage.setItem('obelisk:preferences', JSON.stringify({ postQuantumEnabled: false }));
      const { getPreferences } = await import('@/services/preferences/preferences');
      expect(getPreferences().postQuantumEnabled).toBe(false);
    });

    it('falls back to the default when storage holds a non-boolean', async () => {
      localStorage.setItem('obelisk:preferences', JSON.stringify({ postQuantumEnabled: 'yes' }));
      const { getPreferences } = await import('@/services/preferences/preferences');
      expect(getPreferences().postQuantumEnabled).toBe(true);
    });
  });

  describe('notification preferences', () => {
    it('defaults: sounds on, Crystal ringtone, browser notifications on, background watch on', async () => {
      const { getPreferences } = await import('@/services/preferences/preferences');
      expect(getPreferences()).toMatchObject({
        notificationSounds: true,
        notificationRingtone: 'crystal',
        browserNotifications: true,
        backgroundRelayWatch: true,
      });
    });

    it('ignores the retired desktopNotifications key (its old default was persisted as false)', async () => {
      localStorage.setItem('obelisk:preferences', JSON.stringify({ desktopNotifications: false }));
      const { getPreferences } = await import('@/services/preferences/preferences');
      expect(getPreferences().browserNotifications).toBe(true);
    });

    it('persists a chosen ringtone', async () => {
      const { setPreference } = await import('@/services/preferences/preferences');
      setPreference('notificationRingtone', 'marimba');
      vi.resetModules();
      const { getPreferences } = await import('@/services/preferences/preferences');
      expect(getPreferences().notificationRingtone).toBe('marimba');
    });

    it('falls back to Crystal for an unknown ringtone from storage or a caller', async () => {
      localStorage.setItem('obelisk:preferences', JSON.stringify({ notificationRingtone: 'airhorn' }));
      const { getPreferences, setPreference } = await import('@/services/preferences/preferences');
      expect(getPreferences().notificationRingtone).toBe('crystal');
      setPreference('notificationRingtone', 'nope' as never);
      expect(getPreferences().notificationRingtone).toBe('crystal');
    });
  });
});
