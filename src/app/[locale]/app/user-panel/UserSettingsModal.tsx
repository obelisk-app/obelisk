'use client';

import Container from '@/components/ui/layout/Container';
import { createPortal } from 'react-dom';
import type { JsUserMetadata } from '@/services/nostr-bridge';
import UserAvatar from '@/components/ui/media/UserAvatar';
import LazyMediaLibraryModal from '@/components/media/library/LazyMediaLibraryModal';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import CloseButton from '@/components/ui/buttons/CloseButton';
import {
  BellIcon,
  FileIcon,
  LogOutIcon,
  PaletteIcon,
  ServerIcon,
  GearIcon,
  ShieldIcon,
  SmileIcon,
  UserIcon,
  UserPlusIcon,
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
import RelayInviteSettings from '@/components/settings/invite/RelayInviteSettings';
import { useCanInvite } from '@/hooks/settings/invite/useCanInvite';
import type { MessageKey } from '@/i18n/keys';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

type SettingsNavGroup = {
  label: MessageKey;
  items: ReadonlyArray<{ id: SettingsSection; Icon: (p: { size?: number }) => React.ReactElement }>;
};

const USER_NAV: SettingsNavGroup = { label: 'settings.group.user', items: [{ id: 'profile', Icon: UserIcon }] };
// Only for accounts the relay lets invite (`useCanInvite`).
const USER_NAV_WITH_INVITES: SettingsNavGroup = {
  label: 'settings.group.user',
  items: [{ id: 'profile', Icon: UserIcon }, { id: 'invites', Icon: UserPlusIcon }],
};

const APP_NAV: SettingsNavGroup = {
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
};

const SETTINGS_NAV: ReadonlyArray<SettingsNavGroup> = [USER_NAV, APP_NAV];
const SETTINGS_NAV_WITH_INVITES: ReadonlyArray<SettingsNavGroup> = [USER_NAV_WITH_INVITES, APP_NAV];

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
  const nav = useCanInvite() ? SETTINGS_NAV_WITH_INVITES : SETTINGS_NAV;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm p-10 md:p-24 flex items-stretch justify-stretch"
      data-testid="user-edit-modal"
    >
      <div className="relative flex w-full rounded-2xl overflow-hidden border border-lc-border shadow-2xl bg-lc-black">
        {/* The neutral dismiss every dialog uses (ModalHeader's), not a red "destructive" circle. */}
        <CloseButton
          onClick={onDone}
          className="absolute right-4 top-4 z-10"
          title={`${t('common.close')} (Esc)`}
          data-testid="user-settings-close"
        />
        <aside className="w-64 shrink-0 bg-lc-dark border-r border-lc-border flex flex-col">
          <div className="px-5 py-5 border-b border-lc-border">
            <Text as="div" variant="label" size="10" tone="muted" weight="semibold" className="mb-2">{t('shell.user.settings')}</Text>
            <div className="flex items-center gap-2 min-w-0">
              <UserAvatar pubkey={pubkey} picture={meta?.picture ?? null} size={8} name={displayName} initialClassName="text-sm" />
              <div className="min-w-0">
                <Text as="div" size="sm" tone="default" className="truncate">{displayName}</Text>
                {meta?.nip05 && <div className="text-[10px] text-lc-green truncate">{meta.nip05}</div>}
              </div>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto p-2" aria-label={t('shell.user.settings')}>
            {nav.map((group) => (
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
            <LazyMediaLibraryModal embedded onClose={() => setSettingsTab('profile')} />
          ) : (
            <Container width="3xl" className="px-10 py-10" data-testid={`settings-section-${settingsTab}`}>
              <div className="mb-6">
                <Heading as="h2" className="text-lc-white text-xl font-semibold">{t(`settings.section.${settingsTab}.label`)}</Heading>
                <Text as="p" variant="muted" className="mt-1">{t(`settings.section.${settingsTab}.desc`)}</Text>
              </div>
              {settingsTab === 'profile' && (
                <EditProfileForm
                  pubkey={pubkey}
                  initial={meta}
                  onCancel={onDone}
                  onSaved={onDone}
                />
              )}
              {settingsTab === 'invites' && <RelayInviteSettings />}
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
