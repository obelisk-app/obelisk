'use client';

import Container from '@/components/ui/layout/Container';
import { createPortal } from 'react-dom';
import type { JsUserMetadata } from '@/services/nostr-bridge';
import UserAvatar from '@/components/ui/media/UserAvatar';
import MediaLibraryModal from '@/components/media/library/MediaLibraryModal';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import {
  BellIcon,
  CloseIcon,
  FileIcon,
  LogOutIcon,
  PaletteIcon,
  ServerIcon,
  GearIcon,
  ShieldIcon,
  SmileIcon,
  UserIcon,
  WrenchIcon,
  ZapIcon,
} from '@/assets/icons';
import { EditProfileForm } from '../settings/EditProfileForm';
import LocalDataPanel from '@/components/settings/privacy/LocalDataPanel';
import type { SettingsSection } from '@/services/settings/open-settings';
import { AdvancedSettingsSection } from '../settings/AdvancedSettingsSection';
import AppearancePreferenceControls from '@/components/settings/appearance/AppearancePreferenceControls';
import { GeneralSettingsSection } from '../settings/GeneralSettingsSection';
import NotificationSettings from '@/components/settings/notifications/NotificationSettings';
import { PrivacySettingsSection } from '../settings/PrivacySettingsSection';
import SocialRelaySettings from '@/components/settings/social-relays/SocialRelaySettings';
import WalletSettings from '@/components/settings/wallet/WalletSettings';
import type { MessageKey } from '@/i18n/keys';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

const SETTINGS_NAV: ReadonlyArray<{
  label: MessageKey;
  items: ReadonlyArray<{ id: SettingsSection; Icon: (p: { size?: number }) => React.ReactElement }>;
}> = [
    { label: 'settings.group.user', items: [{ id: 'profile', Icon: UserIcon }] },
    {
      label: 'settings.group.app',
      items: [
        { id: 'general', Icon: GearIcon },
        { id: 'appearance', Icon: PaletteIcon },
        { id: 'notifications', Icon: BellIcon },
        { id: 'relays', Icon: ServerIcon },
        { id: 'privacy', Icon: ShieldIcon },
        { id: 'wallet', Icon: ZapIcon },
        { id: 'media', Icon: SmileIcon },
        { id: 'data', Icon: FileIcon },
        { id: 'advanced', Icon: WrenchIcon },
      ],
    },
  ];

type Props = {
  pubkey: string;
  meta: JsUserMetadata | null;
  displayName: string;
  settingsTab: SettingsSection;
  setSettingsTab: (tab: SettingsSection) => void;
  /** Leave the settings (and the panel). */
  onDone: () => void;
  onLogout: () => void;
};

/** Fullscreen user settings: the section nav on the left, the open section on the right. */
export function UserSettingsModal({ pubkey, meta, displayName, settingsTab, setSettingsTab, onDone, onLogout }: Props) {
  const t = useTranslations();
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
            <Text as="div" variant="label" size="10" tone="muted" weight="semibold" className="mb-2">{t('shell.user.settings')}</Text>
            <div className="flex items-center gap-2 min-w-0">
              <UserAvatar pubkey={pubkey} picture={meta?.picture ?? null} size={8} name={displayName} initialClassName="text-sm" />
              <div className="min-w-0">
                <div className="text-sm text-lc-white truncate">{displayName}</div>
                {meta?.nip05 && <div className="text-[10px] text-lc-green truncate">{meta.nip05}</div>}
              </div>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto p-2" aria-label={t('shell.user.settings')}>
            {SETTINGS_NAV.map((group) => (
              <div key={group.label} className="mb-3">
                {/* The header card above already says "User settings". */}
                {group.label !== 'settings.group.user' && (
                  <Text as="div" variant="label" size="10" tone="muted" weight="semibold" className="px-3 pb-1 pt-2">
                    {t(group.label)}
                  </Text>
                )}
                <div className="space-y-0.5">
                  {group.items.map(({ id, Icon }) => (
                    <Button
                      variant="bare"
                      key={id}
                      type="button"
                      onClick={() => setSettingsTab(id)}
                      aria-current={settingsTab === id ? 'page' : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${settingsTab === id ? 'bg-lc-green/15 text-lc-green' : 'text-lc-white hover:bg-lc-border/40'}`}
                      data-testid={id === 'media' ? 'desktop-media-library' : `settings-nav-${id}`}
                    >
                      <Icon size={16} />
                      <span>{t(`settings.section.${id}.label`)}</span>
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="border-t border-lc-border p-2">
            <Button
              variant="bare"
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-2.5 rounded-md bg-red-500/20 px-3 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/30"
              data-testid="desktop-logout"
            >
              <LogOutIcon size={16} />
              <span>{t('shell.user.logOut')}</span>
            </Button>
          </div>
        </aside>
        <main className={`flex-1 min-w-0 ${settingsTab === 'media' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {settingsTab === 'media' ? (
            <MediaLibraryModal embedded onClose={() => setSettingsTab('profile')} />
          ) : (
            <Container width="3xl" className="px-10 py-10" data-testid={`settings-section-${settingsTab}`}>
              <div className="mb-6">
                <Heading as="h2" className="text-lc-white text-xl font-semibold">{t(`settings.section.${settingsTab}.label`)}</Heading>
                <Text as="p" variant="muted" className="mt-1">{t(`settings.section.${settingsTab}.desc`)}</Text>
              </div>
              {settingsTab === 'profile' && (
                <EditProfileForm
                  initial={meta}
                  onCancel={onDone}
                  onSaved={onDone}
                />
              )}
              {settingsTab === 'general' && <GeneralSettingsSection />}
              {settingsTab === 'appearance' && <AppearancePreferenceControls />}
              {settingsTab === 'notifications' && <NotificationSettings />}
              {settingsTab === 'relays' && <SocialRelaySettings />}
              {settingsTab === 'privacy' && <PrivacySettingsSection />}
              {settingsTab === 'wallet' && <WalletSettings />}
              {settingsTab === 'data' && <LocalDataPanel />}
              {settingsTab === 'advanced' && <AdvancedSettingsSection />}
            </Container>
          )}
        </main>
      </div>
    </div>,
    document.body,
  );
}
