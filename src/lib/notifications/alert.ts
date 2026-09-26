/**
 * The audible/OS half of a notification. The card half lives in
 * `src/store/notifications.ts`; this runs only after a card was actually
 * added, so dedupe and read-cursor filtering have already happened.
 *
 * Two extra gates on top of the store's:
 *
 *   • **Freshness.** Only events newer than {@link ALERT_FRESH_WINDOW_MS}
 *     alert. A reload that backfills yesterday's unread mention still gets
 *     a card, but it does not chime at you as if it just happened.
 *   • **Once per event id**, across both the active-relay path and the
 *     background watcher — the same kind 9 can arrive on both.
 */
import { getPreferences, setPreference } from '@/lib/preferences';
import { useToastStore } from '@/store/toast';
import { getTranslation, isLocale } from '@/i18n';
import { playNotificationSound, type NotificationSoundKind } from './sound';

export const ALERT_FRESH_WINDOW_MS = 2 * 60 * 1000;
const SEEN_CAP = 500;

export interface IncomingAlert {
  readonly kind: NotificationSoundKind;
  /** Event id — the dedupe key. */
  readonly id: string;
  /** Unix milliseconds. */
  readonly createdAt: number;
  /** OS notification title. */
  readonly title: string;
  /** OS notification body. */
  readonly body: string;
}

const seen = new Set<string>();
let blockedHintShown = false;

function tr(): (key: string) => string {
  const lang = typeof document !== 'undefined' ? document.documentElement.lang : '';
  return getTranslation(isLocale(lang) ? lang : 'en');
}

/**
 * The browser wouldn't let the chime play (no click/keypress on this page
 * since it loaded) and no system notification could stand in for it. Say so
 * once per page load, and make the toast the one-click way to turn on
 * desktop notifications — the only thing that can ring before a gesture.
 */
function showSoundsBlockedHint(): void {
  if (blockedHintShown) return;
  blockedHintShown = true;
  const t = tr();
  useToastStore.getState().pushToast({
    title: t('notifications.soundBlocked.title'),
    body: t('notifications.soundBlocked.body'),
    onClick: () => {
      void requestDesktopNotificationPermission().then((granted) => {
        if (granted) setPreference('browserNotifications', true);
      });
    },
  });
}

function remember(id: string): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  if (seen.size > SEEN_CAP) {
    const oldest = seen.values().next().value;
    if (oldest !== undefined) seen.delete(oldest);
  }
  return true;
}

function pageIsBackgrounded(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.visibilityState === 'hidden') return true;
  return typeof document.hasFocus === 'function' && !document.hasFocus();
}

function canShowOsNotification(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

/**
 * `withSound`: let the OS play its notification sound. Used when our own
 * chime was blocked — the system sound needs no user gesture, so it's what
 * makes a ping audible in another tab right after a reload.
 */
function showOsNotification(alert: IncomingAlert, withSound: boolean): void {
  if (!canShowOsNotification()) return;
  try {
    const n = new Notification(alert.title, {
      body: alert.body,
      tag: `obelisk-${alert.kind}-${alert.id}`,
      icon: '/icon-192.png',
      silent: !withSound,
    });
    n.onclick = () => {
      try { window.focus(); } catch { /* ignore */ }
      n.close();
    };
  } catch {
    // Some mobile browsers only allow notifications through a service
    // worker registration and throw "Illegal constructor" here.
  }
}

/** Returns `true` when the alert passed the gates (whether or not audio could play). */
export function announceIncoming(alert: IncomingAlert, now = Date.now()): boolean {
  if (now - alert.createdAt > ALERT_FRESH_WINDOW_MS) return false;
  if (!remember(alert.id)) return false;
  const prefs = getPreferences();
  const sound = prefs.notificationSounds ? playNotificationSound(alert.kind, now) : 'off';
  const chimed = sound === 'played';
  const backgrounded = pageIsBackgrounded();
  const osAllowed = prefs.browserNotifications && canShowOsNotification();
  if (osAllowed && (backgrounded || sound === 'blocked')) {
    // Our chime couldn't play → let the OS make the noise instead.
    showOsNotification(alert, sound === 'blocked');
  } else if (sound === 'blocked' && !chimed) {
    showSoundsBlockedHint();
  }
  return true;
}

/**
 * Ask for OS notification permission. Must be called from a user gesture.
 * Resolves to whether notifications are now allowed.
 */
export async function requestDesktopNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export function desktopNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

/** Test seam. */
export function __resetAlertsForTests(): void {
  seen.clear();
  blockedHintShown = false;
}
