'use client';

/**
 * The ⋯ menu on a person.
 *
 * There were two of these and they disagreed. The profile page offered
 * "copy npub" and a share that put the bare npub on the clipboard; the
 * popover in chat offered no ⋯ at all. Neither could hand you the thing
 * people actually paste — `obelisk.ar/p/<npub>`, the page that previews with
 * a name and a picture and opens in a browser for someone who has never
 * heard of Nostr.
 *
 * So: one menu, used by both, with the same items in the same order as
 * `NoteMenu` — share, copy the link, then the identifiers, then moderation.
 */

import { useRef, useState } from 'react';
import { hexToNpub } from '@nostr-wot/data';
import { useTranslation } from '@/i18n/context';
import { usePreferences } from '@/lib/preferences';
import { useModerationStore } from '@/store/moderation';
import { useToastStore } from '@/store/toast';
import { profileUrl } from '@/lib/social/note-links';
import AnchoredMenu from './AnchoredMenu';
import { ICON_BUTTON_CLASS, MENU_PANEL_CLASS, MenuDivider, MenuItem, MenuLink } from '@/components/ui/menu';
import { BanIcon, BellOffIcon, ExternalIcon, HashIcon, KeyIcon, LinkIcon, MoreIcon, ShareIcon, ZapIcon } from '@/components/ui/icons';

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
  const { t } = useTranslation();
  const relays = usePreferences().socialRelays;
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const muted = useModerationStore((state) => state.mutedPubkeys.includes(pubkey));
  const blocked = useModerationStore((state) => state.blockedPubkeys.includes(pubkey));
  const toggleMute = useModerationStore((state) => state.toggleMute);
  const toggleBlock = useModerationStore((state) => state.toggleBlock);

  const url = profileUrl(pubkey, relays);
  const npub = safeNpub(pubkey);

  const toast = (title: string) =>
    useToastStore.getState().pushToast({ title, body: displayName });

  const copy = (value: string, message: string) => {
    // `Promise.resolve` because a clipboard shim can return undefined, and
    // `.catch` on that throws out of the click handler — losing the toast.
    void Promise.resolve(navigator.clipboard?.writeText(value)).catch(() => {});
    toast(message);
    setOpen(false);
  };

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: displayName, url });
      else await navigator.clipboard?.writeText(url);
      toast(t('profileFeed.profileShared'));
    } catch {
      // Share sheet dismissed — not an error worth surfacing.
    }
    setOpen(false);
  };

  const box = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${ICON_BUTTON_CLASS} ${box} ${open ? 'border-lc-green/50 bg-lc-green/10' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={t('mobile.profile.more')}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('mobile.profile.more')}
        data-testid="profile-more-button"
      >
        <MoreIcon size={size === 'sm' ? 18 : 20} />
      </button>

      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        width={248}
        testId="profile-more-menu"
        panelClassName={MENU_PANEL_CLASS}
      >
        <>
          <MenuItem icon={<ShareIcon />} label={t('profileFeed.shareProfile')} onClick={() => void share()} testId="profile-menu-share" />
          <MenuItem icon={<LinkIcon />} label={t('profileFeed.copyProfileLink')} onClick={() => copy(url, t('profileFeed.linkCopied'))} testId="profile-menu-copy-link" />
          <MenuLink icon={<ExternalIcon />} label={t('profileFeed.openProfilePage')} href={url} testId="profile-menu-open-page" />

          <MenuDivider />

          <MenuItem icon={<KeyIcon />} label={t('profileFeed.copyNpub')} onClick={() => copy(npub, t('profileFeed.npubCopied'))} testId="profile-menu-copy-npub" />
          <MenuItem icon={<HashIcon />} label={t('profileFeed.copyHex')} onClick={() => copy(pubkey, t('profileFeed.hexCopied'))} testId="profile-menu-copy-hex" />

          {onZap && (
            <>
              <MenuDivider />
              <MenuItem
                icon={<ZapIcon />}
                label={t('profilePopover.zap')}
                onClick={() => { setOpen(false); onBeforeAction?.(); onZap(); }}
                testId="profile-menu-zap"
              />
            </>
          )}

          {canModerate && (
            <>
              <MenuDivider />
              <MenuItem
                icon={<BellOffIcon />}
                label={t(muted ? 'profileFeed.unmute' : 'profileFeed.mute')}
                onClick={() => { toggleMute(pubkey); setOpen(false); }}
                testId="profile-menu-mute"
              />
              <MenuItem
                icon={<BanIcon />}
                danger
                label={t(blocked ? 'profileFeed.unblock' : 'profileFeed.block')}
                onClick={() => { toggleBlock(pubkey); setOpen(false); }}
                testId="profile-menu-block"
              />
            </>
          )}
        </>
      </AnchoredMenu>
    </>
  );
}

function safeNpub(pubkey: string): string {
  try {
    return hexToNpub(pubkey);
  } catch {
    return pubkey;
  }
}
