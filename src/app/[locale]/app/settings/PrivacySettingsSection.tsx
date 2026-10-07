'use client';

import { setPreference } from '@/services/preferences/preferences';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { setDmOptInEnabled } from '@/services/chat/dm/opt-in';
import WotSettings from '@/components/settings/privacy/WotSettings';
import CallSettings from '@/components/settings/notifications/CallSettings';
import MutedAndBlocked from '@/components/settings/privacy/MutedAndBlocked';
import { useTranslations } from 'next-intl';
import { PostQuantumStatusRow } from './PostQuantumStatusRow';
import { ToggleRow } from './ToggleRow';

export function PrivacySettingsSection() {
  const prefs = usePreferences();
  const t = useTranslations();
  return (
    <div className="space-y-5">
      <ToggleRow
        label={t('settings.preferences.directMessages.label')}
        description={t('settings.preferences.directMessages.description')}
        checked={prefs.directMessagesEnabled}
        onChange={setDmOptInEnabled}
      />
      <div>
        <ToggleRow
          label={t('settings.postQuantum')}
          description={t('settings.postQuantumHint')}
          checked={prefs.postQuantumEnabled}
          onChange={(v) => setPreference('postQuantumEnabled', v)}
        />
        <PostQuantumStatusRow />
      </div>
      <CallSettings />
      <MutedAndBlocked />
      <WotSettings />
    </div>
  );
}
