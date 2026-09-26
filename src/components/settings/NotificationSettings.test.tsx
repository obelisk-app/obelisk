import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const previewRingtone = vi.fn();
vi.mock('@/lib/notifications/sound', () => ({
  previewRingtone: (...a: unknown[]) => previewRingtone(...a),
  RINGTONES: ['crystal', 'marimba', 'aurora', 'bubble'],
}));

import NotificationSettings from './NotificationSettings';
import { LocaleProvider } from '@/i18n/context';

const renderLocalized = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);
import { getPreferences, setPreference } from '@/lib/preferences';

describe('NotificationSettings', () => {
  beforeEach(() => {
    setPreference('notificationSounds', true);
    setPreference('browserNotifications', true);
    setPreference('backgroundRelayWatch', true);
    previewRingtone.mockReset();
    setPreference('notificationRingtone', 'crystal');
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([false, true])('renders the three toggles (mobile=%s)', (mobile) => {
    renderLocalized(<NotificationSettings mobile={mobile} />);
    expect(screen.getByTestId('notif-toggle-notificationSounds').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('notif-toggle-browserNotifications').getAttribute('aria-checked')).toBe('false');
    expect(screen.getByTestId('notif-toggle-backgroundRelayWatch').getAttribute('aria-checked')).toBe('true');
  });

  it('toggles sounds and the background watch', () => {
    renderLocalized(<NotificationSettings />);
    fireEvent.click(screen.getByTestId('notif-toggle-notificationSounds'));
    fireEvent.click(screen.getByTestId('notif-toggle-backgroundRelayWatch'));
    expect(getPreferences().notificationSounds).toBe(false);
    expect(getPreferences().backgroundRelayWatch).toBe(false);
  });

  it('plays a test chime in the chosen ringtone', () => {
    renderLocalized(<NotificationSettings />);
    fireEvent.click(screen.getByTestId('notif-test-sound'));
    expect(previewRingtone).toHaveBeenCalledWith('crystal', 'dm');
  });

  it.each([false, true])('picking a ringtone saves and previews it (mobile=%s)', (mobile) => {
    renderLocalized(<NotificationSettings mobile={mobile} />);
    expect(screen.getByTestId('ringtone-crystal').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByTestId('ringtone-aurora'));
    expect(getPreferences().notificationRingtone).toBe('aurora');
    expect(previewRingtone).toHaveBeenCalledWith('aurora', 'mention');
    expect(screen.getByTestId('ringtone-aurora').getAttribute('aria-checked')).toBe('true');
  });

  it('hides the ringtone picker when sounds are off', () => {
    setPreference('notificationSounds', false);
    renderLocalized(<NotificationSettings />);
    expect(screen.queryByTestId('ringtone-picker')).toBeNull();
  });

  it('shows browser notifications off until the browser grants permission, and asks on click', async () => {
    const requestPermission = vi.fn(async () => {
      (N as unknown as { permission: string }).permission = 'granted';
      return 'granted';
    });
    const N = Object.assign(vi.fn(), { permission: 'default', requestPermission });
    vi.stubGlobal('Notification', N);
    renderLocalized(<NotificationSettings />);
    // The preference defaults on, but it isn't really on until the browser says so.
    expect(screen.getByTestId('notif-toggle-browserNotifications').getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByTestId('notif-toggle-browserNotifications'));
    await waitFor(() => expect(
      screen.getByTestId('notif-toggle-browserNotifications').getAttribute('aria-checked'),
    ).toBe('true'));
    expect(requestPermission).toHaveBeenCalled();
    expect(getPreferences().browserNotifications).toBe(true);
  });

  it('turning it off in Preferences silences them without asking the browser', async () => {
    const requestPermission = vi.fn();
    vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'granted', requestPermission }));
    renderLocalized(<NotificationSettings />);
    const toggle = screen.getByTestId('notif-toggle-browserNotifications');
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(toggle);
    expect(getPreferences().browserNotifications).toBe(false);
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('false'));
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('is disabled with an explanation when the browser blocked notifications', async () => {
    vi.stubGlobal('Notification', Object.assign(vi.fn(), { permission: 'denied', requestPermission: vi.fn() }));
    renderLocalized(<NotificationSettings />);
    await waitFor(() => expect(
      (screen.getByTestId('notif-toggle-browserNotifications') as HTMLButtonElement).disabled,
    ).toBe(true));
    expect(screen.getByText(/Blocked in your browser/)).toBeTruthy();
  });

  it('leaves browser notifications off when the popup is refused', async () => {
    const N = Object.assign(vi.fn(), { permission: 'default', requestPermission: vi.fn(async () => 'denied') });
    vi.stubGlobal('Notification', N);
    renderLocalized(<NotificationSettings />);
    fireEvent.click(screen.getByTestId('notif-toggle-browserNotifications'));
    await waitFor(() => expect(N.requestPermission).toHaveBeenCalled());
    await waitFor(() => expect(getPreferences().browserNotifications).toBe(false));
  });
});
