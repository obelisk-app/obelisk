'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { setPreference, type Preferences } from '@/services/preferences/preferences';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { desktopNotificationPermission, requestDesktopNotificationPermission } from '@/services/notifications/alert';
import { previewRingtone } from '@/services/notifications/sound';
import { watchNotificationPermission, type DesktopPermission } from '@/services/settings/notification-permission';
import { desktopNotificationHintKey, desktopNotificationsBlocked } from '@/utils/settings/notification-rows';

export type NotificationToggleKey = 'notificationSounds' | 'browserNotifications' | 'backgroundRelayWatch';

export interface NotificationRow {
  key: NotificationToggleKey;
  label: string;
  description: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

/**
 * Sounds, OS popups and the background relay watch. Browser notifications
 * count as on only when the person wants them AND the browser allows them;
 * switching them on asks with the browser's popup when undecided.
 */
export function useNotificationSettings() {
  const t = useTranslations();
  const prefs = usePreferences();
  const [permission, setPermission] = useState<DesktopPermission>('default');

  useEffect(() => watchNotificationPermission(setPermission), []);

  const browserOn = prefs.browserNotifications && permission === 'granted';

  const toggleDesktop = async () => {
    if (browserOn) {
      setPreference('browserNotifications', false);
      return;
    }
    const granted = await requestDesktopNotificationPermission();
    setPermission(desktopNotificationPermission());
    setPreference('browserNotifications', granted);
  };

  const rows: NotificationRow[] = [
    {
      key: 'notificationSounds',
      label: t('settings.preferences.notifications.sounds.label'),
      description: t('settings.preferences.notifications.sounds.description'),
      on: prefs.notificationSounds,
      onToggle: () => setPreference('notificationSounds', !prefs.notificationSounds),
    },
    {
      key: 'browserNotifications',
      label: t('settings.preferences.notifications.desktop.label'),
      description: t(desktopNotificationHintKey(permission)),
      on: browserOn,
      onToggle: () => { void toggleDesktop(); },
      disabled: desktopNotificationsBlocked(permission),
    },
    {
      key: 'backgroundRelayWatch',
      label: t('settings.preferences.notifications.background.label'),
      description: t('settings.preferences.notifications.background.description'),
      on: prefs.backgroundRelayWatch,
      onToggle: () => setPreference('backgroundRelayWatch', !prefs.backgroundRelayWatch),
    },
  ];

  // Picking a ringtone previews it: hearing is the only way to choose one.
  const pickRingtone = (id: Preferences['notificationRingtone']) => {
    setPreference('notificationRingtone', id);
    previewRingtone(id, 'mention');
  };

  return {
    rows,
    soundsOn: prefs.notificationSounds,
    ringtone: prefs.notificationRingtone,
    pickRingtone,
    testSound: () => previewRingtone(prefs.notificationRingtone, 'dm'),
  };
}
