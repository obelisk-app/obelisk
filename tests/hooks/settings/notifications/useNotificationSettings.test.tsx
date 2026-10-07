import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

const previewRingtone = vi.hoisted(() => vi.fn());
vi.mock('@/services/notifications/sound', () => ({
  previewRingtone: (...a: unknown[]) => previewRingtone(...a),
  RINGTONES: ['crystal', 'marimba'],
}));

import { getPreferences, setPreference } from '@/services/preferences/preferences';
import { useNotificationSettings } from '@/hooks/settings/notifications/useNotificationSettings';

const row = (result: { current: ReturnType<typeof useNotificationSettings> }, key: string) =>
  result.current.rows.find((r) => r.key === key)!;

beforeEach(() => {
  setPreference('notificationSounds', true);
  setPreference('browserNotifications', true);
  setPreference('backgroundRelayWatch', false);
  setPreference('notificationRingtone', 'crystal');
  previewRingtone.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('useNotificationSettings', () => {
  it('toggles sounds and the background watch', () => {
    const { result } = renderHook(() => useNotificationSettings(), { wrapper: LocaleProvider });
    act(() => row(result, 'notificationSounds').onToggle());
    act(() => row(result, 'backgroundRelayWatch').onToggle());
    expect(getPreferences()).toMatchObject({ notificationSounds: false, backgroundRelayWatch: true });
    expect(row(result, 'notificationSounds').on).toBe(false);
    expect(result.current.soundsOn).toBe(false);
  });

  it('counts browser notifications on only once the browser grants them, asking on toggle', async () => {
    const N = { permission: 'default', requestPermission: vi.fn(async () => { N.permission = 'granted'; return 'granted'; }) };
    vi.stubGlobal('Notification', N);
    const { result } = renderHook(() => useNotificationSettings(), { wrapper: LocaleProvider });
    expect(row(result, 'browserNotifications').on).toBe(false);
    await act(async () => row(result, 'browserNotifications').onToggle());
    await waitFor(() => expect(row(result, 'browserNotifications').on).toBe(true));
    act(() => row(result, 'browserNotifications').onToggle());
    expect(getPreferences().browserNotifications).toBe(false);
  });

  it('disables the browser row where it is blocked', () => {
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: vi.fn() });
    const { result } = renderHook(() => useNotificationSettings(), { wrapper: LocaleProvider });
    expect(row(result, 'browserNotifications').disabled).toBe(true);
  });

  it('a picked ringtone is saved and previewed; the test plays the saved one as a DM', () => {
    const { result } = renderHook(() => useNotificationSettings(), { wrapper: LocaleProvider });
    act(() => result.current.pickRingtone('marimba'));
    expect(getPreferences().notificationRingtone).toBe('marimba');
    expect(previewRingtone).toHaveBeenCalledWith('marimba', 'mention');
    act(() => result.current.testSound());
    expect(previewRingtone).toHaveBeenLastCalledWith('marimba', 'dm');
  });
});
