/**
 * The audible/OS half of a notification. The card half lives in
 * `src/store/notifications/index.ts`; this runs only after a card was actually
 * added, so dedupe and read-cursor filtering have already happened.
 *
 * Two extra gates on top of the store's:
 *
 *   • **Freshness.** Only events newer than {@link ALERT_FRESH_WINDOW_MS}
 *     alert. A reload that backfills yesterday's unread mention still gets
 *     a card, but it does not chime at you as if it just happened.
 *   • **Once per event id**, across both the active-relay path and the
 *     background watcher: the same kind 9 can arrive on both.
 */
import { getPreferences, setPreference } from '@/services/preferences/preferences';
import { useToastStore } from '@/store/feedback/toast';
import { translate } from '@/i18n/runtime';
import { playNotificationSound, startRingLoop, type NotificationSoundKind, type PlayResult } from './sound';
import { ALERT_FRESH_WINDOW_MS } from '@/constants/notifications/alert';

const SEEN_CAP = 500;

export interface IncomingAlert {
  readonly kind: NotificationSoundKind;
  /** Event id, the dedupe key. */
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

/**
 * The browser wouldn't let the chime play (no click/keypress on this page
 * since it loaded) and no system notification could stand in for it. Say so
 * once per page load, and make the toast the one-click way to turn on
 * desktop notifications, the only thing that can ring before a gesture.
 */
function showSoundsBlockedHint(): void {
  if (blockedHintShown) return;
  blockedHintShown = true;
  const t = translate;
  useToastStore.getState().pushToast({
    title: t('common.soundBlocked.title'),
    body: t('common.soundBlocked.body'),
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
 * chime was blocked: the system sound needs no user gesture, so it's what
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
 * An incoming DM call: loop the user's ringtone and, when the tab is in the
 * background or the ring can't play, raise an OS notification. Same gates as
 * a message (the `notificationSounds` and `browserNotifications`
 * preferences), so muting chimes mutes the ring too.
 *
 * The body says only that a call is coming in, never from whom: the shade is
 * readable by anyone looking at the screen, the same rule DM popups follow.
 * The returned `stop` ends the ring and closes the notification.
 */
export function ringIncomingCall(alert: { id: string; title: string; body: string }): { stop: () => void } {
  const prefs = getPreferences();
  const loop = prefs.notificationSounds ? startRingLoop('ring') : null;
  const sound: PlayResult | 'off' = loop?.first ?? 'off';
  let notification: Notification | null = null;
  const osAllowed = prefs.browserNotifications && canShowOsNotification();
  if (osAllowed && (pageIsBackgrounded() || sound === 'blocked')) {
    try {
      notification = new Notification(alert.title, {
        body: alert.body,
        tag: `obelisk-call-${alert.id}`,
        icon: '/icon-192.png',
        requireInteraction: true,
        silent: sound === 'played',
      });
      notification.onclick = () => {
        try { window.focus(); } catch { /* ignore */ }
        notification?.close();
      };
    } catch {
      notification = null;
    }
  } else if (sound === 'blocked') {
    showSoundsBlockedHint();
  }
  return {
    stop: () => {
      loop?.stop();
      try { notification?.close(); } catch { /* ignore */ }
    },
  };
}

/** The caller's side: a quiet ringback until the other side answers. */
export function startRingback(): { stop: () => void } {
  if (!getPreferences().notificationSounds) return { stop: () => {} };
  const loop = startRingLoop('ringback');
  return { stop: loop.stop };
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
