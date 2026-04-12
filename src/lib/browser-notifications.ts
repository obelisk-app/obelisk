/**
 * Browser Notification API helpers.
 * These only work in secure contexts (HTTPS or localhost).
 */

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function showBrowserNotification(
  title: string,
  body: string,
  onClick?: () => void,
): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const notification = new Notification(title, {
    body,
    icon: '/obelisk-favicon.png',
    tag: `obelisk-${Date.now()}`,
  });

  if (onClick) {
    notification.onclick = () => {
      window.focus();
      onClick();
      notification.close();
    };
  }
}
