'use client';

import Button from '@/components/ui/buttons/Button';
import type { RefObject } from 'react';
import { useTranslations } from 'next-intl';
import UserAvatar from '@/components/ui/media/UserAvatar';
import { LogOutIcon, UserIcon } from '@/assets/icons';
import { MENU_PANEL_CLASS, MenuItem, MenuLink } from '@/components/ui/overlays/menu';
import type { SavedAccount } from '@/utils/marketing/saved-account';
import type { NavbarModel } from '@/hooks/marketing/useNavbar';

/** The signed-in account pill and its menu: the name and short npub, the profile link and Disconnect. */
export default function NavAccountMenu({
  account,
  name,
  npub,
  menu,
  menuRef,
  triggerRef,
}: {
  account: SavedAccount;
  name: string;
  npub: string;
  menu: NavbarModel['menu'];
  menuRef: RefObject<HTMLDivElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations();
  return (
    <div className="relative">
      {/* The account pill: avatar and name in one rounded trigger, a look of its own. */}
      <Button
        variant="bare"
        ref={triggerRef}
        type="button"
        onClick={menu.toggle}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        className="flex items-center gap-2.5 py-1.5 pl-1.5 pr-4 bg-lc-dark hover:bg-lc-border rounded-full transition-all duration-200 border border-lc-border/50"
        data-testid="nav-account-menu"
      >
        <UserAvatar
          pubkey={account.pubkey}
          picture={account.picture}
          size={8}
          name={name}
          alt={name}
          className="ring-1 ring-lc-border"
          initialClassName="text-sm"
        />
        <span className="text-sm text-lc-white font-medium max-w-[120px] truncate">
          {name}
        </span>
      </Button>

      {menu.open && (
        <div ref={menuRef} role="menu" className={`absolute right-0 z-50 mt-2 w-56 ${MENU_PANEL_CLASS}`}>
          <div className="mb-1 border-b border-lc-border px-3 pb-2 pt-1">
            <div className="text-sm text-lc-white font-semibold truncate">{name}</div>
            <div className="text-xs text-lc-muted truncate mt-0.5 font-mono">{npub}</div>
          </div>
          <MenuLink
            icon={<UserIcon />}
            label={t('marketing.nav.profile')}
            href="/app"
            newTab={false}
            testId="nav-profile-link"
          />
          <MenuItem
            icon={<LogOutIcon />}
            label={t('marketing.nav.disconnect')}
            danger
            onClick={menu.logout}
            testId="nav-disconnect"
          />
        </div>
      )}
    </div>
  );
}
