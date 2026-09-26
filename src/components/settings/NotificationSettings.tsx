'use client';

import { useEffect, useState } from 'react';
import { setPreference, usePreferences, type Preferences } from '@/lib/preferences';
import {
  desktopNotificationPermission,
  requestDesktopNotificationPermission,
} from '@/lib/notifications/alert';
import { previewRingtone, RINGTONES } from '@/lib/notifications/sound';
import { useTranslation } from '@/i18n/context';

type BoolPref = 'notificationSounds' | 'browserNotifications' | 'backgroundRelayWatch';

/**
 * Sounds, OS popups, and the background relay watch. One component for both
 * shells — `mobile` switches to the phone's `settings-*` classes, same as
 * `SocialRelaySettings`.
 */
export default function NotificationSettings({ mobile = false }: { mobile?: boolean }) {
  const { t } = useTranslation();
  const prefs = usePreferences();
  const [permission, setPermission] = useState<ReturnType<typeof desktopNotificationPermission>>('default');

  useEffect(() => {
    const update = () => setPermission(desktopNotificationPermission());
    update();
    // The first-click popup (permission-prompt.ts) can resolve while this
    // panel is open; follow the browser's answer.
    let status: PermissionStatus | null = null;
    void navigator.permissions?.query({ name: 'notifications' as PermissionName })
      .then((s) => { status = s; s.onchange = update; })
      .catch(() => {});
    window.addEventListener('focus', update);
    return () => {
      window.removeEventListener('focus', update);
      if (status) status.onchange = null;
    };
  }, []);

  // On = the user wants them AND the browser allows them.
  const browserOn = prefs.browserNotifications && permission === 'granted';

  const toggleDesktop = async () => {
    if (browserOn) {
      setPreference('browserNotifications', false);
      return;
    }
    // Asks with the browser popup when undecided; a no-op when already granted.
    const granted = await requestDesktopNotificationPermission();
    setPermission(desktopNotificationPermission());
    setPreference('browserNotifications', granted);
  };

  const desktopHint = permission === 'unsupported'
    ? t('preferences.notifications.desktop.unsupported')
    : permission === 'denied'
      ? t('preferences.notifications.desktop.denied')
      : t('preferences.notifications.desktop.description');

  const rows: Array<{
    key: BoolPref;
    label: string;
    description: string;
    onToggle: () => void;
    disabled?: boolean;
  }> = [
    {
      key: 'notificationSounds',
      label: t('preferences.notifications.sounds.label'),
      description: t('preferences.notifications.sounds.description'),
      onToggle: () => setPreference('notificationSounds', !prefs.notificationSounds),
    },
    {
      key: 'browserNotifications',
      label: t('preferences.notifications.desktop.label'),
      description: desktopHint,
      onToggle: () => { void toggleDesktop(); },
      disabled: permission === 'unsupported' || permission === 'denied',
    },
    {
      key: 'backgroundRelayWatch',
      label: t('preferences.notifications.background.label'),
      description: t('preferences.notifications.background.description'),
      onToggle: () => setPreference('backgroundRelayWatch', !prefs.backgroundRelayWatch),
    },
  ];

  const isOn = (key: BoolPref) => (key === 'browserNotifications' ? browserOn : (prefs as Preferences)[key]);

  // Picking a ringtone previews it — hearing is the only way to choose one.
  const pickRingtone = (id: Preferences['notificationRingtone']) => {
    setPreference('notificationRingtone', id);
    previewRingtone(id, 'mention');
  };
  const ringtonePicker = (
    <div data-testid="ringtone-picker" role="radiogroup" aria-label={t('preferences.notifications.ringtone.label')}>
      <div className={mobile ? 'settings-row-meta muted' : 'text-xs text-lc-muted'} style={mobile ? { marginBottom: 8 } : undefined}>
        {t('preferences.notifications.ringtone.label')}
      </div>
      <div className={mobile ? '' : 'mt-1.5 grid grid-cols-2 gap-2'} style={mobile ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } : undefined}>
        {RINGTONES.map((id) => {
          const selected = prefs.notificationRingtone === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => pickRingtone(id)}
              data-testid={`ringtone-${id}`}
              className={mobile
                ? `settings-btn-secondary ${selected ? 'on' : ''}`
                : `rounded-lg border px-3 py-2 text-left text-sm transition-colors ${selected ? 'border-lc-green bg-lc-green/10 text-lc-white' : 'border-lc-border bg-lc-card/40 text-lc-white hover:border-lc-green/50 hover:bg-lc-green/5'}`}
              style={mobile && selected ? { borderColor: 'var(--app-accent)', color: 'var(--app-accent)' } : undefined}
            >
              <span className="block font-semibold">{t(`preferences.notifications.ringtone.${id}`)}</span>
              <span className={mobile ? 'settings-row-meta muted' : 'block text-[11px] text-lc-muted'}>
                {t(`preferences.notifications.ringtone.${id}.hint`)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  if (mobile) {
    return (
      <div className="settings-section" data-testid="notification-settings">
        <div className="settings-section-title">{t('preferences.notifications.title')}</div>
        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            className="settings-row action"
            onClick={row.onToggle}
            disabled={row.disabled}
          >
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block' }}>{row.label}</span>
              <span className="settings-row-meta muted" style={{ display: 'block', maxWidth: '100%', marginTop: 3 }}>
                {row.description}
              </span>
            </span>
            <span
              className={`toggle ${isOn(row.key) ? 'on' : ''}`}
              role="switch"
              aria-checked={isOn(row.key)}
              data-testid={`notif-toggle-${row.key}`}
            />
          </button>
        ))}
        {prefs.notificationSounds && (
          <div className="settings-row !block">{ringtonePicker}</div>
        )}
        <button
          type="button"
          className="settings-row action"
          onClick={() => previewRingtone(prefs.notificationRingtone, 'dm')}
          data-testid="notif-test-sound"
        >
          <span>{t('preferences.notifications.test')}</span>
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-lc-border bg-lc-dark/30 p-3" data-testid="notification-settings">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-lc-muted">
          {t('preferences.notifications.title')}
        </h3>
        <button
          type="button"
          onClick={() => previewRingtone(prefs.notificationRingtone, 'dm')}
          className="rounded-full border border-lc-border bg-lc-card/60 px-3 py-1 text-xs font-semibold text-lc-white hover:border-lc-green/50 hover:bg-lc-green/10"
          data-testid="notif-test-sound"
        >
          {t('preferences.notifications.test')}
        </button>
      </div>
      {rows.map((row) => (
        <div key={row.key}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm text-lc-white">{row.label}</div>
            <div className="mt-0.5 text-xs text-lc-muted">{row.description}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isOn(row.key)}
            aria-label={row.label}
            disabled={row.disabled}
            onClick={row.onToggle}
            data-testid={`notif-toggle-${row.key}`}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${isOn(row.key) ? 'bg-lc-green' : 'bg-lc-border'}`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-lc-black transition-transform ${isOn(row.key) ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </button>
        </div>
        {row.key === 'notificationSounds' && prefs.notificationSounds && (
          <div className="mt-3">{ringtonePicker}</div>
        )}
        </div>
      ))}
    </section>
  );
}
