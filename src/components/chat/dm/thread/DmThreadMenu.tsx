'use client';

/**
 * The ⋯ control in a DM thread header.
 *
 * Everything you could previously do to a conversation lived somewhere else:
 * the peer's profile was behind clicking their name, their npub was only
 * copyable from the profile popover, and muting or blocking meant going to
 * Settings → Muted & blocked and pasting a key. So the header had actions
 * you could see (the protection indicator) and none you could take.
 *
 * Deliberately sits *beside* the protection indicator rather than absorbing
 * it. That indicator reports what the conversation rests on (it is state,
 * not a menu) and burying it one click deep would make the one thing the
 * header says about safety invisible.
 *
 * Mute and block are per-device and local (`useModerationStore`), matching
 * what the settings panel already does; nothing here publishes a NIP-51 list.
 */

import AnchoredMenu from '@/components/common/AnchoredMenu';
import { useDmThreadMenu } from '@/hooks/chat/dm/thread/useDmThreadMenu';
import { useTranslations } from 'next-intl';
import { MENU_PANEL_CLASS, MenuDivider, MenuItem } from '@/components/ui/overlays/menu';
import { BanIcon, BellIcon, BellOffIcon, CheckBadgeIcon, KeyIcon, MoreIcon, UserIcon } from '@/assets/icons';
import IconButton from '@/components/ui/buttons/IconButton';

export default function DmThreadMenu({
  peer,
  onOpenProfile,
  className = '',
}: {
  peer: string;
  onOpenProfile?: (pubkey: string) => void;
  /** Lets each shell position it with its own spacing utilities. */
  className?: string;
}) {
  const t = useTranslations();
  const {
    blocked, close, copied, copyNpub, muted, open, openProfile, toggle, toggleBlock, toggleMute, triggerRef,
  } = useDmThreadMenu(peer, onOpenProfile);

  return (
    <>
      <IconButton
        ref={triggerRef}
        shape="square"
        size="8"
        tone={open ? 'accent' : 'outline'}
        onClick={toggle}
        // Same square as the call buttons beside it, so the header's actions
        // read as one set.
        className={`active:scale-95 ${className}`}
        aria-label={t('dm.conversationOptions')}
        title={t('dm.conversationOptions')}
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid="dm-thread-menu"
      >
        <MoreIcon size={16} />
      </IconButton>

      <AnchoredMenu
        open={open}
        onClose={close}
        anchorRef={triggerRef}
        width={220}
        panelClassName={MENU_PANEL_CLASS}
        testId="dm-thread-menu-panel"
      >
        {onOpenProfile && (
          <MenuItem
            icon={<UserIcon />}
            label={t('dm.viewProfile')}
            onClick={openProfile}
            testId="dm-menu-profile"
          />
        )}
        <MenuItem
          icon={copied ? <CheckBadgeIcon /> : <KeyIcon />}
          label={copied ? t('common.copied') : t('shell.user.copyNpub')}
          onClick={copyNpub}
          testId="dm-menu-copy-npub"
        />
        <MenuDivider />
        <MenuItem
          icon={muted ? <BellIcon /> : <BellOffIcon />}
          label={t(muted ? 'social.profileFeed.unmute' : 'social.profileFeed.mute')}
          onClick={toggleMute}
          testId="dm-menu-mute"
        />
        {/* Destructive last and in red, so it can't be hit on the way to
            something harmless. */}
        <MenuItem
          icon={<BanIcon />}
          label={t(blocked ? 'social.profileFeed.unblock' : 'social.profileFeed.block')}
          onClick={toggleBlock}
          danger={!blocked}
          testId="dm-menu-block"
        />
      </AnchoredMenu>
    </>
  );
}
