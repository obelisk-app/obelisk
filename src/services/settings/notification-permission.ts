import { desktopNotificationPermission } from '@/services/notifications/alert';

export type DesktopPermission = ReturnType<typeof desktopNotificationPermission>;

/**
 * Report the browser's notification permission now, and again whenever it
 * may have changed: the permission's own change event (the first-click
 * popup in permission-prompt.ts can resolve while settings are open) and the
 * window regaining focus. Returns the unsubscribe.
 */
export function watchNotificationPermission(onPermission: (p: DesktopPermission) => void): () => void {
  const update = () => onPermission(desktopNotificationPermission());
  update();
  let status: PermissionStatus | null = null;
  void navigator.permissions?.query({ name: 'notifications' as PermissionName })
    .then((s) => { status = s; s.onchange = update; })
    .catch(() => {});
  window.addEventListener('focus', update);
  return () => {
    window.removeEventListener('focus', update);
    if (status) status.onchange = null;
  };
}
