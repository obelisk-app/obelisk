'use client';

import { setPreference } from '@/services/preferences/preferences';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import LanguagePreference from '@/components/settings/appearance/LanguagePreference';
import { useTranslations } from 'next-intl';
import { ToggleRow } from './ToggleRow';

export function GeneralSettingsSection() {
  const prefs = usePreferences();
  const t = useTranslations();
  return (
    <div className="space-y-4">
      <LanguagePreference />
      <ToggleRow
        label={t('settings.preferences.activity.label')}
        description={t('settings.preferences.activity.description')}
        checked={prefs.showActivityIndicator}
        onChange={(v) => setPreference('showActivityIndicator', v)}
      />
    </div>
  );
}
