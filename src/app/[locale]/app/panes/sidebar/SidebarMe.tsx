'use client';

import Text from '@/components/ui/layout/Text';
import Button from '@/components/ui/buttons/Button';
import UserPanel from '../../user-panel/UserPanel';
import { GearIcon } from '@/assets/icons';
import { useTranslations } from 'next-intl';
import { Avatar } from '../../desktop/Avatar';
import { useSidebarMe } from '@/hooks/shell/panes/sidebar/useSidebarMe';

/** The signed-in account at the foot of the sidebar: avatar, name, handle, and the settings gear. */
export function SidebarMe({ collapsible = false }: { collapsible?: boolean }) {
  const t = useTranslations();
  const vm = useSidebarMe();

  if (!vm.myPubkey) return null;
  // Reveal on the PARENT's hover (`group/me`), not this element's, so the
  // whole bar is one target - expanding only when the pointer happens to
  // land on the avatar would feel broken.
  const revealed = collapsible
    ? 'hidden group-hover/me:flex group-focus-within/me:flex'
    : 'flex';
  return (
    <div className="relative flex w-full items-center gap-2">
      <Button
        variant="bare"
        type="button"
        onClick={vm.openProfile}
        className="flex min-w-0 flex-1 items-center gap-2 rounded text-left hover:bg-lc-card/50"
        title={t('shell.desktop.me.profile')}
        data-testid="sidebar-profile-button"
        data-tour="profile-button"
      >
        <Avatar pubkey={vm.myPubkey} size={8} picture={vm.meta?.picture ?? null} />
        <div className={`min-w-0 flex-1 flex-col ${revealed}`}>
          <div className="truncate text-sm font-semibold text-lc-white">
            {vm.name || t('shell.desktop.me.you')}
          </div>
          {/* NIP-05 when there is one, else a short npub - never raw hex. */}
          <Text as="div" size="11" tone="muted" className="truncate" data-testid="sidebar-profile-handle">
            {vm.handle}
          </Text>
        </div>
      </Button>
      <Button
        variant="bare"
        onClick={vm.openPreferences}
        className={`shrink-0 rounded-md p-1.5 text-lc-white/80 transition-colors hover:bg-lc-green/15 hover:text-lc-green ${
          collapsible ? 'hidden group-hover/me:block group-focus-within/me:block' : ''
        }`}
        title={t('settings.openPreferences')}
        aria-label={t('settings.openPreferences')}
        data-testid="user-settings-button"
      >
        <GearIcon size={18} />
      </Button>
      {vm.editing && (
        <UserPanel
          pubkey={vm.myPubkey}
          isMe
          initialEditing
          initialTab={vm.initialTab}
          onClose={vm.closePanel}
        />
      )}
    </div>
  );
}

