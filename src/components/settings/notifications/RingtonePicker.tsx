'use client';

import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';
import { RINGTONES } from '@/services/notifications/sound';
import type { Preferences } from '@/types/preferences/preferences';

/** The ringtones as radio buttons, each with its hint; picking one plays it. */
export default function RingtonePicker({ value, onPick, mobile }: {
  value: Preferences['notificationRingtone'];
  onPick: (id: Preferences['notificationRingtone']) => void;
  mobile: boolean;
}) {
  const t = useTranslations();
  return (
    <div data-testid="ringtone-picker" role="radiogroup" aria-label={t('settings.preferences.notifications.ringtone.label')}>
      <div className={mobile ? 'settings-row-meta muted' : 'text-xs text-lc-muted'} style={mobile ? { marginBottom: 8 } : undefined}>
        {t('settings.preferences.notifications.ringtone.label')}
      </div>
      <div className={mobile ? '' : 'mt-1.5 grid grid-cols-2 gap-2'} style={mobile ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } : undefined}>
        {RINGTONES.map((id) => (
          <Button
            variant="bare"
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            onClick={() => onPick(id)}
            data-testid={`ringtone-${id}`}
            className={mobile
              ? `settings-btn-secondary ${value === id ? 'on' : ''}`
              : `rounded-lg border px-3 py-2 text-left text-sm transition-colors ${value === id ? 'border-lc-green bg-lc-green/10 text-lc-white' : 'border-lc-border bg-lc-card/40 text-lc-white hover:border-lc-green/50 hover:bg-lc-green/5'}`}
            style={mobile && value === id ? { borderColor: 'var(--app-accent)', color: 'var(--app-accent)' } : undefined}
          >
            <span className="block font-semibold">{t(`settings.preferences.notifications.ringtone.${id}.label`)}</span>
            <span className={mobile ? 'settings-row-meta muted' : 'block text-[11px] text-lc-muted'}>
              {t(`settings.preferences.notifications.ringtone.${id}.hint`)}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
