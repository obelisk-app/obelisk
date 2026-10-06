'use client';

/**
 * The card a click on a name opens: banner, avatar, identity, details and
 * actions. Anchored beside the click when the store has an anchor,
 * centred over a dimmed backdrop otherwise. The pieces sit in `./profile/`.
 */
import { displayNameFor } from '@/utils/identity/display-name';
import { useRef } from 'react';
import { hexToNpub } from '@nostr-wot/data';
import { useChatStore } from '@/store/chat';
import { useMyPubkey } from '@/services/nostr-bridge';
import UserAvatar from '@/components/ui/UserAvatar';
import RemoteImage from '@/components/ui/RemoteImage';
import { useTranslation } from '@/i18n/context';
import ProfileMenu from '@/components/social/ProfileMenu';
import { ZapIcon } from '@/components/ui/icons';
import { useNip05Status } from '@/hooks/useNip05Status';
import { useDismiss } from '@/hooks/useDismiss';
import { copyWithToast, popoverShortNpub } from './profile/profile-labels';
import { requestZapPrefill, usePopoverMember } from '@/hooks/chat/profile/usePopoverMember';
import { usePopoverPlacement } from '@/hooks/chat/profile/usePopoverPlacement';
import { renderWithEmojis } from './profile/popover-emoji';
import { PopoverIdentity } from './profile/PopoverIdentity';
import { PopoverDetails } from './profile/PopoverDetails';
import { PopoverActions } from './profile/PopoverActions';
import IconButton from '@/components/ui/IconButton';

export default function ProfilePopover({ pubkey, onClose, onExplore, onMessage }: {
  pubkey: string;
  onClose: () => void;
  onExplore: (pubkey: string) => void;
  onMessage?: (pubkey: string) => void;
}) {
  const { t } = useTranslation();
  const serverEmojis = useChatStore((s) => s.serverEmojis);
  const anchor = useChatStore((s) => s.profilePopupAnchor);
  const member = usePopoverMember(pubkey);
  const panelRef = useRef<HTMLDivElement>(null);
  const viewerPubkey = useMyPubkey();
  const isSelf = viewerPubkey === pubkey;
  // `verify` mode: the reader opened this person, so one request to the
  // domain they named is theirs to make. List rows elsewhere only peek.
  const nip05State = useNip05Status(pubkey, member?.nip05, 'verify');

  useDismiss({ onDismiss: onClose, outside: 'none' });
  usePopoverPlacement(panelRef, anchor);

  let npub = '';
  try { npub = hexToNpub(pubkey); } catch {}
  // Never the raw 64-char hex: when bech32 encoding threw, this popover
  // printed the whole pubkey as the person's name.
  const displayName = member?.displayName || displayNameFor(pubkey);
  const npubShort = npub ? popoverShortNpub(pubkey) : pubkey;
  const zap = () => {
    if (!requestZapPrefill(pubkey, displayName)) return;
    onClose();
  };
  return (
    <div
      className={`fixed inset-0 z-[100] flex p-4 ${anchor ? 'items-start justify-start bg-transparent' : 'items-center justify-center bg-black/60'}`}
      onClick={onClose}
      data-testid="profile-popover-backdrop"
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-lc-dark border border-lc-border rounded-xl shadow-2xl"
        style={anchor ? { position: 'fixed' } : undefined}
        data-testid="profile-popover"
        role="dialog"
      >
        {/* Banner */}
        <div
          className="relative h-24 w-full overflow-hidden rounded-t-xl bg-gradient-to-br from-lc-olive to-lc-black"
          data-testid="profile-banner"
        >
          {/* An <img>, not a CSS background, so the banner gets the same
              no-referrer fetch as every other image someone else chose. */}
          {member?.banner && <RemoteImage src={member.banner} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        </div>

        {/* Avatar overlaps the banner; the action cluster sits on the banner's
            lower edge opposite it, so name and handle get the full width. */}
        <div className="relative px-4" data-testid="profile-name-row">
          <div className="absolute -top-10 left-4">
            <UserAvatar
              pubkey={pubkey}
              picture={member?.picture ?? null}
              size={20}
              name={displayName || '?'}
              alt={displayName}
              className="border-4 border-lc-dark"
              initialClassName="text-2xl"
            />
          </div>
          <div className="flex justify-end gap-1.5 pt-2.5">
            {!isSelf && (
              <IconButton
                shape="square"
                size="8"
                tone="accent"
                onClick={zap}
                className="active:scale-95"
                aria-label={t('profilePopover.zap')}
                title={t('profilePopover.zap')}
                data-testid="profile-zap-btn"
              >
                <ZapIcon size={16} fill="currentColor" />
              </IconButton>
            )}
            <ProfileMenu
              pubkey={pubkey}
              displayName={displayName}
              canModerate={!isSelf}
              size="sm"
            />
          </div>
        </div>

        <div className="space-y-3 px-4 pb-4 pt-4">
          <PopoverIdentity
            pubkey={pubkey}
            member={member}
            displayName={displayName}
            serverEmojis={serverEmojis}
            nip05State={nip05State}
            npub={npub}
            npubShort={npubShort}
            onCopyNpub={() => copyWithToast(npub, t('profileFeed.npubCopied'), npubShort)}
          />

          {member?.about && (
            <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-lc-white/85" data-testid="profile-about">
              {renderWithEmojis(member.about, serverEmojis)}
            </p>
          )}

          <PopoverDetails member={member} />

          <PopoverActions
            pubkey={pubkey}
            isSelf={isSelf}
            onClose={onClose}
            onExplore={onExplore}
            onMessage={onMessage}
          />
        </div>
      </div>
    </div>
  );
}
