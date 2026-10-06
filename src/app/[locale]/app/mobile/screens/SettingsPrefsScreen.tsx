'use client';

import { useState } from 'react';
import { nostrActions } from '@/services/nostr-bridge';
import LanguagePreference from '@/components/settings/LanguagePreference';
import MediaLibraryModal from '@/components/media/MediaLibraryModal';
import AppearancePreferenceControls from '@/components/settings/AppearancePreferenceControls';
import NotificationSettings from '@/components/settings/NotificationSettings';
import SocialRelaySettings from '@/components/settings/SocialRelaySettings';
import MutedAndBlocked from '@/components/settings/MutedAndBlocked';
import CallSettings from '@/components/settings/CallSettings';
import AccountBackupExport from '@/components/settings/AccountBackupExport';
import DeveloperSignatureTest from '@/components/settings/DeveloperSignatureTest';
import { clearAllClientCacheExceptSession } from '@/services/cache-clear';
import { useTranslations } from 'next-intl';
import { setDmOptInEnabled } from '@/services/dm/opt-in';
import { useDmOptInEnabled } from '@/hooks/dm/useDmOptInEnabled';
import { useHintsStore } from '@/store/hints';
import { useToastStore } from '@/store/toast';
import { type ScreenName } from '@/utils/shell/mobile/url-state';
import { confirmDialog } from '@/services/confirm-dialog';
import { DisconnectConfirmSheet } from '../sheets/DisconnectConfirmSheet';
import BackButton from '../BackButton';

export function SettingsPrefsScreen({ go }: { go: (s: ScreenName, dir?: 'forward' | 'back') => void }) {
  const t = useTranslations();
  const dmOptInEnabled = useDmOptInEnabled();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const clearLocalCache = async () => {
    const ok = await confirmDialog({
      title: t('settings.preferences.localData.confirm.title'),
      message: t('settings.preferences.localData.confirm.description'),
      confirmLabel: t('settings.preferences.localData.confirm.action'),
    });
    if (!ok) return;
    clearAllClientCacheExceptSession();
    setTimeout(() => window.location.reload(), 0);
  };

  if (appearanceOpen) {
    return (
      <div className="screen active" data-screen="settings-appearance">
        <div className="app-header">
          <BackButton onClick={() => setAppearanceOpen(false)} />
          <h2>{t('settings.preferences.appearance.title')}</h2>
        </div>
        <div className="settings-body">
          <AppearancePreferenceControls variant="mobile" />
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="screen active" data-screen="settings-prefs">
      {/* Back to the profile, since the tab pair that used to do this is gone. */}
      <div className="app-header">
        <BackButton onClick={() => go('settings-profile', 'back')} data-testid="prefs-back" />
        <h2>{t('settings.preferencesTitle')}</h2>
      </div>
      <div className="settings-body">
        <div className="settings-section">
          <div className="settings-section-title">{t('settings.preferences.mobile.app')}</div>
          <LanguagePreference variant="mobile" />
          <button
            type="button"
            className="settings-row action"
            onClick={() => setAppearanceOpen(true)}
            data-testid="mobile-appearance-submenu"
          >
            <span>{t('settings.preferences.appearance.title')}</span>
            <span className="settings-row-meta muted" aria-hidden="true">›</span>
          </button>
          {/* The hints are one-shot, so this is the only way back to them. */}
          <button
            type="button"
            className="settings-row action"
            onClick={() => {
              useHintsStore.getState().resetHints();
              useToastStore.getState().pushToast({ title: t('shell.hints.replayed'), body: '' });
            }}
            data-testid="mobile-replay-hints"
          >
            <span>{t('shell.hints.replay')}</span>
          </button>
          <button type="button" className="settings-row action" onClick={() => setMediaLibraryOpen(true)} data-testid="mobile-media-library">
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block' }}>{t('mobile.settings.packs')}</span>
              <span className="settings-row-meta muted" style={{ display: 'block', maxWidth: '100%', marginTop: 3 }}>{t('mobile.settings.packsHint')}</span>
            </span>
            <span className="settings-row-meta muted" aria-hidden="true">›</span>
          </button>
          <button
            type="button"
            className="settings-row action"
            onClick={() => setDmOptInEnabled(!dmOptInEnabled)}
          >
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block' }}>{t('settings.preferences.directMessages.label')}</span>
              <span className="settings-row-meta muted" style={{ display: 'block', maxWidth: '100%', marginTop: 3 }}>
                {t('settings.preferences.directMessages.mobileDescription')}
              </span>
            </span>
            <span
              className={`toggle ${dmOptInEnabled ? 'on' : ''}`}
              role="switch"
              aria-checked={dmOptInEnabled}
              data-testid="mobile-dm-opt-in-toggle"
            />
          </button>
          <div className="settings-row">
            <span>{t("settings.preferences.mobile.version")}</span>
            <span className="settings-row-meta muted">obelisk · mobile</span>{/* i18n-exempt: product build name */}
          </div>
        </div>
        <div className="settings-section">
          <div className="settings-section-title">{t("settings.preferences.backup.advanced")}</div>
          <AccountBackupExport mobile />
          <button
            type="button"
            className="settings-btn-danger"
            onClick={clearLocalCache}
            data-testid="mobile-clear-cache-button"
          >
            {t('settings.preferences.localData.clear.button')}
          </button>
        </div>
        <NotificationSettings mobile />
        <SocialRelaySettings mobile />
        <CallSettings mobile />
        <MutedAndBlocked mobile />
        <DeveloperSignatureTest mobile />
        <div className="settings-section">
          <div className="settings-section-title">{t("mobile.settings.identity")}</div>
          <button
            className="settings-btn-danger"
            onClick={() => setConfirmingLogout(true)}
            data-testid="disconnect-btn"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {t("mobile.settings.disconnect")}
          </button>
        </div>
      </div>
    </div>
      {mediaLibraryOpen && <MediaLibraryModal onClose={() => setMediaLibraryOpen(false)} />}
      {confirmingLogout && (
        <DisconnectConfirmSheet
          onConfirm={() => { setConfirmingLogout(false); void nostrActions.logout(); }}
          onCancel={() => setConfirmingLogout(false)}
        />
      )}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// rehydrating
