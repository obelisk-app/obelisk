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
        className={`flex ${box} shrink-0 items-center justify-center rounded-full border border-lc-border bg-lc-dark text-base leading-none text-lc-white transition-colors hover:border-lc-white/30 hover:bg-white/10 active:scale-95`}
        onClick={() => setOpen((value) => !value)}
        aria-label={t('mobile.profile.more')}
        aria-expanded={open}
        data-testid="profile-more-button"
      >
        ⋯
      </button>

      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        width={232}
        testId="profile-more-menu"
      >
        <>
          <Item onClick={() => void share()} testId="profile-menu-share">
            {t('profileFeed.shareProfile')}
          </Item>
          <Item
            onClick={() => copy(url, t('profileFeed.linkCopied'))}
            testId="profile-menu-copy-link"
          >
            {t('profileFeed.copyProfileLink')}
          </Item>
          <LinkItem href={url} testId="profile-menu-open-page">
            {t('profileFeed.openProfilePage')}
          </LinkItem>

          <Divider />

          <Item
            onClick={() => copy(npub, t('profileFeed.npubCopied'))}
            testId="profile-menu-copy-npub"
          >
            {t('profileFeed.copyNpub')}
          </Item>
          <Item
            onClick={() => copy(pubkey, t('profileFeed.hexCopied'))}
            testId="profile-menu-copy-hex"
          >
            {t('profileFeed.copyHex')}
          </Item>

          {onZap && (
            <>
              <Divider />
              <Item
                onClick={() => { setOpen(false); onBeforeAction?.(); onZap(); }}
                testId="profile-menu-zap"
              >
                {t('profilePopover.zap')}
              </Item>
            </>
          )}

          {canModerate && (
            <>
              <Divider />
              <Item
                onClick={() => { toggleMute(pubkey); setOpen(false); }}
                testId="profile-menu-mute"
              >
                {t(muted ? 'profileFeed.unmute' : 'profileFeed.mute')}
              </Item>
              <Item
                danger
                onClick={() => { toggleBlock(pubkey); setOpen(false); }}
                testId="profile-menu-block"
              >
                {t(blocked ? 'profileFeed.unblock' : 'profileFeed.block')}
              </Item>
            </>
          )}
        </>
      </AnchoredMenu>
    </>
  );
}

function Item({
  children,
  onClick,
  danger,
  testId,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`block w-full px-4 py-2 text-left text-xs hover:bg-white/5 ${danger ? 'text-red-400' : 'text-lc-white'}`}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

function LinkItem({
  children,
  href,
  testId,
}: {
  children: React.ReactNode;
  href: string;
  testId: string;
}) {
  return (
    <a
      role="menuitem"
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="block w-full px-4 py-2 text-left text-xs text-lc-white hover:bg-white/5"
      data-testid={testId}
    >
      {children}
    </a>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-lc-border" aria-hidden="true" />;
}

function safeNpub(pubkey: string): string {
  try {
    return hexToNpub(pubkey);
  } catch {
    return pubkey;
  }
}
