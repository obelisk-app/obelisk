'use client';

import { useTranslations } from 'next-intl';
import SettingRow from '@/components/ui/forms/SettingRow';
import Toggle from '@/components/ui/forms/Toggle';
import Button from '@/components/ui/buttons/Button';
import Heading from '@/components/ui/layout/Heading';
import { useNotificationSettings } from '@/hooks/settings/notifications/useNotificationSettings';
import RingtonePicker from './RingtonePicker';

/**
 * Sounds, OS popups, and the background relay watch. One component for both
 * shells: `mobile` switches to the phone's `settings-*` classes, same as
 * `SocialRelaySettings`. State and actions come from `useNotificationSettings`.
 */
export default function NotificationSettings({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslations();
  const vm = useNotificationSettings();

  if (mobile) {
    return (
      <div className="settings-section" data-testid="notification-settings">
        <div className="settings-section-title">{t('settings.preferences.notifications.title')}</div>
        {vm.rows.map((row) => (
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
              className={`toggle ${row.on ? 'on' : ''}`}
              role="switch"
              aria-checked={row.on}
              data-testid={`notif-toggle-${row.key}`}
            />
          </button>
        ))}
        {vm.soundsOn && (
          <div className="settings-row !block"><RingtonePicker value={vm.ringtone} onPick={vm.pickRingtone} mobile /></div>
        )}
        <button
          type="button"
          className="settings-row action"
          onClick={vm.testSound}
          data-testid="notif-test-sound"
        >
          <span>{t('settings.preferences.notifications.test')}</span>
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-lc-border bg-lc-dark/30 p-3" data-testid="notification-settings">
      <div className="flex items-center justify-between gap-2">
        <Heading as="h3" variant="label">
          {t('settings.preferences.notifications.title')}
        </Heading>
        <Button
          variant="outlinePill"
          size="xs"
          onClick={vm.testSound}
          data-testid="notif-test-sound"
        >
          {t('settings.preferences.notifications.test')}
        </Button>
      </div>
      {vm.rows.map((row) => (
        <div key={row.key}>
        <SettingRow
          label={row.label}
          description={row.description}
          control={({ descriptionId }) => (
            <Toggle
              checked={row.on}
              onChange={() => row.onToggle()}
              aria-label={row.label}
              aria-describedby={descriptionId}
              disabled={row.disabled}
              data-testid={`notif-toggle-${row.key}`}
            />
          )}
        />
        {row.key === 'notificationSounds' && vm.soundsOn && (
          <div className="mt-3"><RingtonePicker value={vm.ringtone} onPick={vm.pickRingtone} mobile={false} /></div>
        )}
        </div>
      ))}
    </section>
  );
}
