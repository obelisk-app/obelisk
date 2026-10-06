'use client';

import { createPortal } from 'react-dom';
import type { JsUserMetadata } from '@/services/nostr-bridge';
import UserAvatar from '@/components/ui/UserAvatar';
import MediaLibraryModal from '@/components/media/MediaLibraryModal';
import { useTranslation } from '@/i18n/context';
import Button from '@/components/ui/Button';
import {
  BellIcon,
  CloseIcon,
  LogOutIcon,
  PaletteIcon,
  ServerIcon,
  SettingsIcon,
  ShieldIcon,
  SmileIcon,
  UserIcon,
  WrenchIcon,
} from '@/components/ui/icons';
import { EditProfileForm } from '../settings/EditProfileForm';
import {
  AdvancedSettingsSection,
  AppearanceSettingsSection,
  GeneralSettingsSection,
  NotificationsSettingsSection,
  PrivacySettingsSection,
  RelaysSettingsSection,
  type SettingsTab,
} from '../settings/SettingsSections';

const SETTINGS_NAV: ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{ id: SettingsTab; Icon: (p: { size?: number }) => React.ReactElement }>;
}> = [
  { label: 'settings.group.user', items: [{ id: 'profile', Icon: UserIcon }] },
  {
    label: 'settings.group.app',
    items: [
      { id: 'general', Icon: SettingsIcon },
      { id: 'appearance', Icon: PaletteIcon },
      { id: 'notifications', Icon: BellIcon },
      { id: 'relays', Icon: ServerIcon },
      { id: 'privacy', Icon: ShieldIcon },
      { id: 'media', Icon: SmileIcon },
      { id: 'advanced', Icon: WrenchIcon },
    ],
  },
];

type Props = {
  pubkey: string;
  meta: JsUserMetadata | null;
  displayName: string;
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;
  /** Leave the settings (and the panel). */
  onDone: () => void;
  onLogout: () => void;
};

/** Fullscreen user settings: the section nav on the left, the open section on the right. */
export function UserSettingsModal({ pubkey, meta, displayName, settingsTab, setSettingsTab, onDone, onLogout }: Props) {
  const { t } = useTranslation();
  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm p-10 md:p-24 flex items-stretch justify-stretch"
      data-testid="user-edit-modal"
    >
      <div className="relative flex w-full rounded-2xl overflow-hidden border border-lc-border shadow-2xl bg-lc-black">
        <Button
          variant="danger"
          size="icon"
          onClick={onDone}
          className="absolute right-5 top-5 z-10 h-12 w-12 shadow-lg shadow-red-500/30"
          aria-label={t('common.close')}
          title={`${t('common.close')} (Esc)`}
        >
          <CloseIcon size={20} strokeWidth={3} />
        </Button>
        <aside className="w-64 shrink-0 bg-lc-dark border-r border-lc-border flex flex-col">
          <div className="px-5 py-5 border-b border-lc-border">
            <div className="text-[10px] uppercase tracking-wider text-lc-muted font-semibold mb-2">{t('user.settings')}</div>
            <div className="flex items-center gap-2 min-w-0">
              <UserAvatar pubkey={pubkey} picture={meta?.picture ?? null} size={8} name={displayName} initialClassName="text-sm" />
              <div className="min-w-0">
                <div className="text-sm text-lc-white truncate">{displayName}</div>
                {meta?.nip05 && <div className="text-[10px] text-lc-green truncate">{meta.nip05}</div>}
              </div>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto p-2" aria-label={t('user.settings')}>
            {SETTINGS_NAV.map((group) => (
              <div key={group.label} className="mb-3">
                {/* The header card above already says "User settings". */}
                {group.label !== 'settings.group.user' && (
                  <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-lc-muted">
                    {t(group.label)}
                  </div>
                )}
                <div className="space-y-0.5">
                  {group.items.map(({ id, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSettingsTab(id)}
                      aria-current={settingsTab === id ? 'page' : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${settingsTab === id ? 'bg-lc-green/15 text-lc-green' : 'text-lc-white hover:bg-lc-border/40'}`}
                      data-testid={id === 'media' ? 'desktop-media-library' : `settings-nav-${id}`}
                    >
                      <Icon size={16} />
                      <span>{t(`settings.section.${id}`)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="border-t border-lc-border p-2">
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-2.5 rounded-md bg-red-500/20 px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/30"
              data-testid="desktop-logout"
            >
              <LogOutIcon size={16} />
              <span>{t('user.logOut')}</span>
            </button>
          </div>
        </aside>
        <main className={`flex-1 min-w-0 ${settingsTab === 'media' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {settingsTab === 'media' ? (
            <MediaLibraryModal embedded onClose={() => setSettingsTab('profile')} />
          ) : (
            <div className="max-w-3xl mx-auto px-10 py-10" data-testid={`settings-section-${settingsTab}`}>
              <div className="mb-6">
                <h2 className="text-lc-white text-xl font-semibold">{t(`settings.section.${settingsTab}`)}</h2>
                <p className="mt-1 text-sm text-lc-muted">{t(`settings.section.${settingsTab}.desc`)}</p>
              </div>
              {settingsTab === 'profile' && (
                <EditProfileForm
                  initial={meta}
                  onCancel={onDone}
                  onSaved={onDone}
                />
              )}
              {settingsTab === 'general' && <GeneralSettingsSection />}
              {settingsTab === 'appearance' && <AppearanceSettingsSection />}
              {settingsTab === 'notifications' && <NotificationsSettingsSection />}
              {settingsTab === 'relays' && <RelaysSettingsSection />}
              {settingsTab === 'privacy' && <PrivacySettingsSection />}
              {settingsTab === 'advanced' && <AdvancedSettingsSection />}
            </div>
          )}
        </main>
      </div>
    </div>,
    document.body,
  );
}
