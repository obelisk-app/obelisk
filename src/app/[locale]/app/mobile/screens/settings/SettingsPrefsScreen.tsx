'use client';

import LanguagePreference from '@/components/settings/appearance/LanguagePreference';
import MediaLibraryModal from '@/components/media/library/MediaLibraryModal';
import AppearancePreferenceControls from '@/components/settings/appearance/AppearancePreferenceControls';
import NotificationSettings from '@/components/settings/notifications/NotificationSettings';
import SocialRelaySettings from '@/components/settings/social-relays/SocialRelaySettings';
import MutedAndBlocked from '@/components/settings/privacy/MutedAndBlocked';
import CallSettings from '@/components/settings/notifications/CallSettings';
import WalletSettings from '@/components/settings/wallet/WalletSettings';
import AccountBackupExport from '@/components/settings/account/AccountBackupExport';
import DeveloperSignatureTest from '@/components/settings/account/DeveloperSignatureTest';
import LocalDataPanel from '@/components/settings/privacy/LocalDataPanel';
import { useTranslations } from 'next-intl';
import { useSettingsPrefsScreen } from '@/hooks/shell/mobile/screens/settings/useSettingsPrefsScreen';
import { type ScreenName } from '@/utils/shell/mobile/url-state';
import { DisconnectConfirmSheet } from '../../sheets/account/DisconnectConfirmSheet';
import BackButton from '../../chrome/BackButton';
import { SettingsSubScreen } from './SettingsSubScreen';
import { LogOutIcon } from '@/assets/icons';
import Heading from '@/components/ui/layout/Heading';

export function SettingsPrefsScreen({ go }: { go: (s: ScreenName, dir?: 'forward' | 'back') => void }) {
  const t = useTranslations();
  const vm = useSettingsPrefsScreen();

  if (vm.view === 'appearance') {
    return (
      <SettingsSubScreen screen="settings-appearance" title={t('settings.preferences.appearance.title')} onBack={vm.closeView}>
        <AppearancePreferenceControls variant="mobile" />
      </SettingsSubScreen>
    );
  }

  if (vm.view === 'data') {
    return (
      <SettingsSubScreen screen="settings-data" title={t('settings.section.data.label')} onBack={vm.closeView} backTestId="local-data-back">
        <LocalDataPanel mobile />
      </SettingsSubScreen>
    );
  }

  return (
    <>
    <div className="screen active" data-screen="settings-prefs">
      {/* Back to the profile, since the tab pair that used to do this is gone. */}
      <div className="app-header">
        <BackButton onClick={() => go('settings-profile', 'back')} data-testid="prefs-back" />
        <Heading as="h2">{t('settings.preferencesTitle')}</Heading>
      </div>
      <div className="settings-body">
        <div className="settings-section">
          <div className="settings-section-title">{t('settings.preferences.mobile.app')}</div>
          <LanguagePreference variant="mobile" />
          <button
            type="button"
            className="settings-row action"
            onClick={() => vm.openView('appearance')}
            data-testid="mobile-appearance-submenu"
          >
            <span>{t('settings.preferences.appearance.title')}</span>
            <span className="settings-row-meta muted" aria-hidden="true">›</span>
          </button>
          {/* The hints are one-shot, so this is the only way back to them. */}
          <button
            type="button"
            className="settings-row action"
            onClick={vm.replayHints}
            data-testid="mobile-replay-hints"
          >
            <span>{t('shell.hints.replay')}</span>
          </button>
          <button type="button" className="settings-row action" onClick={vm.openMediaLibrary} data-testid="mobile-media-library">
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block' }}>{t('mobile.settings.packs')}</span>
              <span className="settings-row-meta muted" style={{ display: 'block', maxWidth: '100%', marginTop: 3 }}>{t('mobile.settings.packsHint')}</span>
            </span>
            <span className="settings-row-meta muted" aria-hidden="true">›</span>
          </button>
          <button
            type="button"
            className="settings-row action"
            onClick={vm.toggleDms}
          >
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block' }}>{t('settings.preferences.directMessages.label')}</span>
              <span className="settings-row-meta muted" style={{ display: 'block', maxWidth: '100%', marginTop: 3 }}>
                {t('settings.preferences.directMessages.mobileDescription')}
              </span>
            </span>
            <span
              className={`toggle ${vm.dmOptInEnabled ? 'on' : ''}`}
              role="switch"
              aria-checked={vm.dmOptInEnabled}
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
            className="settings-row action"
            onClick={() => vm.openView('data')}
            data-testid="mobile-local-data-submenu"
          >
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block' }}>{t('settings.section.data.label')}</span>
              <span className="settings-row-meta muted" style={{ display: 'block', maxWidth: '100%', marginTop: 3 }}>{t('settings.section.data.desc')}</span>
            </span>
            <span className="settings-row-meta muted" aria-hidden="true">›</span>
          </button>
        </div>
        <NotificationSettings mobile />
        <SocialRelaySettings mobile />
        <CallSettings mobile />
        <WalletSettings mobile />
        <MutedAndBlocked mobile />
        <DeveloperSignatureTest mobile />
        <div className="settings-section">
          <div className="settings-section-title">{t("mobile.settings.identity")}</div>
          <button
            className="settings-btn-danger"
            onClick={vm.askLogout}
            data-testid="disconnect-btn"
          >
            <LogOutIcon size={null} strokeWidth={2} />
            {t("mobile.settings.disconnect")}
          </button>
        </div>
      </div>
    </div>
      {vm.mediaLibraryOpen && <MediaLibraryModal onClose={vm.closeMediaLibrary} />}
      {vm.confirmingLogout && (
        <DisconnectConfirmSheet
          onConfirm={vm.confirmLogout}
          onCancel={vm.cancelLogout}
        />
      )}
    </>
  );
}

