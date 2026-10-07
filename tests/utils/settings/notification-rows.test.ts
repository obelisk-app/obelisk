import { describe, expect, it } from 'vitest';
import { desktopNotificationHintKey, desktopNotificationsBlocked } from '@/utils/settings/notification-rows';

describe('notification row helpers', () => {
  it('explains an unsupported or blocked browser, and describes the row otherwise', () => {
    expect(desktopNotificationHintKey('unsupported')).toBe('settings.preferences.notifications.desktop.unsupported');
    expect(desktopNotificationHintKey('denied')).toBe('settings.preferences.notifications.desktop.denied');
    expect(desktopNotificationHintKey('default')).toBe('settings.preferences.notifications.desktop.description');
    expect(desktopNotificationHintKey('granted')).toBe('settings.preferences.notifications.desktop.description');
  });

  it('blocks the switch only where the browser cannot ask', () => {
    expect(desktopNotificationsBlocked('unsupported')).toBe(true);
    expect(desktopNotificationsBlocked('denied')).toBe(true);
    expect(desktopNotificationsBlocked('default')).toBe(false);
    expect(desktopNotificationsBlocked('granted')).toBe(false);
  });
});
