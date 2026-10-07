'use client';

/**
 * The card a click on a name opens: banner, avatar, identity, details and
 * actions. Anchored beside the click when the store has an anchor,
 * centred over a dimmed backdrop otherwise. The pieces sit in `./profile/`.
 */
import UserAvatar from '@/components/ui/media/UserAvatar';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { useTranslations } from 'next-intl';
import ProfileMenu from '@/components/social/profile/ProfileMenu';
import { ZapIcon } from '@/assets/icons';
import { useProfilePopover } from '@/hooks/chat/profile/useProfilePopover';
import { EmojiText } from './EmojiText';
import { PopoverIdentity } from './PopoverIdentity';
import { PopoverDetails } from './PopoverDetails';
import { PopoverActions } from './PopoverActions';
import IconButton from '@/components/ui/buttons/IconButton';

export default function ProfilePopover({ pubkey, onClose, onExplore, onMessage }: {
  pubkey: string;
  onClose: () => void;
  onExplore: (pubkey: string) => void;
  onMessage?: (pubkey: string) => void;
}) {
  const t = useTranslations();
  const {
    serverEmojis, anchor, member, panelRef, isSelf, nip05State, npub, npubShort, displayName, zap, copyNpub,
  } = useProfilePopover(pubkey, onClose);
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
                aria-label={t('chat.profilePopover.zap')}
                title={t('chat.profilePopover.zap')}
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
            onCopyNpub={copyNpub}
          />

          {member?.about && (
            <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-lc-white/85" data-testid="profile-about">
              <EmojiText text={member.about} emojis={serverEmojis} />
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
