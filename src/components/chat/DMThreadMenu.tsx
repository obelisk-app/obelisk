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

import { useRef, useState } from 'react';
import AnchoredMenu from '@/components/social/AnchoredMenu';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useModerationStore } from '@/store/moderation';
import { useTranslation } from '@/i18n/context';
import { safeNpub } from '@/utils/identity/short-npub';
import { MENU_PANEL_CLASS, MenuDivider, MenuItem } from '@/components/ui/menu';
import { BanIcon, BellIcon, BellOffIcon, CheckBadgeIcon, KeyIcon, MoreIcon, UserIcon } from '@/components/ui/icons';
import IconButton from '@/components/ui/IconButton';

export default function DMThreadMenu({
  peer,
  onOpenProfile,
  className = '',
}: {
  peer: string;
  onOpenProfile?: (pubkey: string) => void;
  /** Lets each shell position it with its own spacing utilities. */
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Flash "Copied!", then close: the menu staying open after a copy reads
  // as the click not having registered.
  const { copied, copy } = useCopyToClipboard({ onReset: () => setOpen(false) });

  const muted = useModerationStore((s) => s.mutedPubkeys.includes(peer));
  const blocked = useModerationStore((s) => s.blockedPubkeys.includes(peer));
  const toggleMute = useModerationStore((s) => s.toggleMute);
  const toggleBlock = useModerationStore((s) => s.toggleBlock);

  const npub = safeNpub(peer);

  return (
    <>
      <IconButton
        ref={triggerRef}
        shape="square"
        size="8"
        tone={open ? 'accent' : 'outline'}
        onClick={() => setOpen((value) => !value)}
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
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        width={220}
        panelClassName={MENU_PANEL_CLASS}
        testId="dm-thread-menu-panel"
      >
        {onOpenProfile && (
          <MenuItem
            icon={<UserIcon />}
            label={t('dm.viewProfile')}
            onClick={() => { setOpen(false); onOpenProfile(peer); }}
            testId="dm-menu-profile"
          />
        )}
        <MenuItem
          icon={copied ? <CheckBadgeIcon /> : <KeyIcon />}
          label={copied ? t('common.copied') : t('user.copyNpub')}
          onClick={() => void copy(npub)}
          testId="dm-menu-copy-npub"
        />
        <MenuDivider />
        <MenuItem
          icon={muted ? <BellIcon /> : <BellOffIcon />}
          label={t(muted ? 'profileFeed.unmute' : 'profileFeed.mute')}
          onClick={() => { toggleMute(peer); setOpen(false); }}
          testId="dm-menu-mute"
        />
        {/* Destructive last and in red, so it can't be hit on the way to
            something harmless. */}
        <MenuItem
          icon={<BanIcon />}
          label={t(blocked ? 'profileFeed.unblock' : 'profileFeed.block')}
          onClick={() => { toggleBlock(peer); setOpen(false); }}
          danger={!blocked}
          testId="dm-menu-block"
        />
      </AnchoredMenu>
    </>
  );
}
