import type { DesktopPermission } from '@/services/settings/notification-permission';

/** The browser-notifications row's description: why it cannot be switched on, or what it does. */
export function desktopNotificationHintKey(permission: DesktopPermission) {
  return permission === 'unsupported'
    ? 'settings.preferences.notifications.desktop.unsupported' as const
    : permission === 'denied'
      ? 'settings.preferences.notifications.desktop.denied' as const
      : 'settings.preferences.notifications.desktop.description' as const;
}

/** Browser notifications can only be asked for where the browser has them and has not blocked them. */
export function desktopNotificationsBlocked(permission: DesktopPermission): boolean {
  return permission === 'unsupported' || permission === 'denied';
}
