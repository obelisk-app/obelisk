/**
 * Raise the browser's notification-permission popup on the user's first
 * click/keypress after login.
 *
 * Browsers only show that popup from a user gesture (Firefox and Safari
 * ignore a request outside one; Chrome demotes it to a quiet icon), so it
 * can't simply fire at login. Instead the first gesture anywhere on the page
 * asks — once per page load, only while the permission is still undecided
 * and `preferences.browserNotifications` is on. Deny or dismiss and it
 * stays quiet; Preferences is where it can be turned back on.
 */
import { getPreferences } from '@/lib/preferences';

const GESTURES = ['pointerdown', 'keydown'] as const;

let asked = false;

function shouldAsk(): boolean {
  if (asked) return false;
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission !== 'default') return false;
  return getPreferences().browserNotifications;
}

/** Arm the one-shot prompt. Returns a disarm function. */
export function armNotificationPermissionPrompt(): () => void {
  if (typeof window === 'undefined' || !shouldAsk()) return () => {};
  const onGesture = () => {
    disarm();
    if (!shouldAsk()) return;
    asked = true;
    try {
      void Notification.requestPermission().catch(() => {});
    } catch {
      // Old Safari: callback-style API only, and it throws on the promise form.
    }
  };
  const disarm = () => {
    for (const type of GESTURES) window.removeEventListener(type, onGesture, true);
  };
  for (const type of GESTURES) window.addEventListener(type, onGesture, true);
  return disarm;
}

/** Test seam. */
export function __resetPermissionPromptForTests(): void {
  asked = false;
}
