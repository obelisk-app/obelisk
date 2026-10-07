'use client';

/**
 * The ⋯ menu on a person.
 *
 * There were two of these and they disagreed. The profile page offered
 * "copy npub" and a share that put the bare npub on the clipboard; the
 * popover in chat offered no ⋯ at all. Neither could hand you the thing
 * people actually paste: `obelisk.ar/p/<npub>`, the page that previews with
 * a name and a picture and opens in a browser for someone who has never
 * heard of Nostr.
 *
 * So: one menu, used by both, with the same items in the same order as
 * `NoteMenu`: share, copy the link, then the identifiers, then moderation.
 */

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useProfileMenu } from '@/hooks/social/profile/useProfileMenu';
import AnchoredMenu from '../../common/AnchoredMenu';
import { MENU_PANEL_CLASS, MenuDivider, MenuItem, MenuLink } from '@/components/ui/overlays/menu';
import { BanIcon, BellOffIcon, ExternalIcon, HashIcon, KeyIcon, LinkIcon, MoreIcon, ShareIcon, ZapIcon } from '@/assets/icons';
import IconButton from '@/components/ui/buttons/IconButton';

export default function ProfileMenu({
  pubkey,
  displayName,
  canModerate = true,
  size = 'md',
  onZap,
  onBeforeAction,
}: {
  pubkey: string;
  displayName: string;
  /** Your own profile has nothing to mute or block. */
  canModerate?: boolean;
  size?: 'sm' | 'md';
  /** Offered only where a zap can actually be composed. */
  onZap?: () => void;
  /** Lets a popover host close itself when the menu navigates away. */
  onBeforeAction?: () => void;
}) {
  const t = useTranslations();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const vm = useProfileMenu({ pubkey, displayName, onZap, onBeforeAction });

  return (
    <>
      <IconButton
        ref={triggerRef}
        shape="square"
        size={size === 'sm' ? '8' : '10'}
        tone={vm.open ? 'accent' : 'outline'}
        className="active:scale-95"
        onClick={vm.toggle}
        aria-label={t('mobile.profile.more')}
        aria-haspopup="menu"
        aria-expanded={vm.open}
        title={t('mobile.profile.more')}
        data-testid="profile-more-button"
      >
        <MoreIcon size={size === 'sm' ? 18 : 20} />
      </IconButton>

      <AnchoredMenu
        open={vm.open}
        onClose={vm.close}
        anchorRef={triggerRef}
        width={248}
        testId="profile-more-menu"
        panelClassName={MENU_PANEL_CLASS}
      >
        <>
          <MenuItem icon={<ShareIcon />} label={t('social.profileFeed.shareProfile')} onClick={vm.share} testId="profile-menu-share" />
          <MenuItem icon={<LinkIcon />} label={t('social.profileFeed.copyProfileLink')} onClick={() => vm.copy(vm.url, t('social.profileFeed.linkCopied'))} testId="profile-menu-copy-link" />
          <MenuLink icon={<ExternalIcon />} label={t('social.profileFeed.openProfilePage')} href={vm.url} testId="profile-menu-open-page" />

          <MenuDivider />

          <MenuItem icon={<KeyIcon />} label={t('social.profileFeed.copyNpub')} onClick={() => vm.copy(vm.npub, t('social.profileFeed.npubCopied'))} testId="profile-menu-copy-npub" />
          <MenuItem icon={<HashIcon />} label={t('social.profileFeed.copyHex')} onClick={() => vm.copy(pubkey, t('social.profileFeed.hexCopied'))} testId="profile-menu-copy-hex" />

          {onZap && (
            <>
              <MenuDivider />
              <MenuItem
                icon={<ZapIcon />}
                label={t('chat.profilePopover.zap')}
                onClick={vm.zap}
                testId="profile-menu-zap"
              />
            </>
          )}

          {canModerate && (
            <>
              <MenuDivider />
              <MenuItem
                icon={<BellOffIcon />}
                label={t(vm.muted ? 'social.profileFeed.unmute' : 'social.profileFeed.mute')}
                onClick={vm.mute}
                testId="profile-menu-mute"
              />
              <MenuItem
                icon={<BanIcon />}
                danger
                label={t(vm.blocked ? 'social.profileFeed.unblock' : 'social.profileFeed.block')}
                onClick={vm.block}
                testId="profile-menu-block"
              />
            </>
          )}
        </>
      </AnchoredMenu>
    </>
  );
}
