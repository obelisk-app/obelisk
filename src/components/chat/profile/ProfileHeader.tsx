'use client';

import type { JsUserMetadata } from '@/services/nostr-bridge';
import { useTranslations } from 'next-intl';
import ProfileMenu from '@/components/social/profile/ProfileMenu';
import UserAvatar from '@/components/ui/media/UserAvatar';
import RemoteImage from '@/components/ui/media/RemoteImage';
import Button from '@/components/ui/buttons/Button';
import { ChevronLeftIcon, CloseIcon, EditIcon, GearIcon } from '@/assets/icons';
import { profileShortNpub } from '@/utils/identity/profile-labels';
import IconButton from '@/components/ui/buttons/IconButton';

type Meta = Partial<JsUserMetadata> | null | undefined;

/**
 * Close control, banner, avatar row and name block of a profile page.
 * Everything above the bio.
 */
export function ProfileHeader({
  pubkey,
  meta,
  displayName,
  isMe,
  mobile,
  settingsMode,
  hideClose,
  onClose,
  onEditProfile,
  onOpenSettings,
  onCreatePost,
  onCopyNpub,
}: {
  pubkey: string;
  meta: Meta;
  displayName: string;
  isMe: boolean;
  mobile: boolean;
  settingsMode: boolean;
  hideClose: boolean;
  onClose: () => void;
  onEditProfile?: () => void;
  onOpenSettings?: () => void;
  onCreatePost: () => void;
  onCopyNpub: () => void;
}) {
  const t = useTranslations();
  return (
    <>
      {!settingsMode && !hideClose && (
        <div className="sticky top-3 z-10 hidden h-0 shrink-0 md:flex md:justify-end" data-testid="profile-explore-close-sticky">
          <IconButton
            tone="overlay"
            onClick={onClose}
            className="mr-3"
            aria-label={t('common.close')}
            data-testid="profile-explore-close"
          >
            <CloseIcon size={18} />
          </IconButton>
        </div>
      )}

      <div
        className="profile-view-banner relative h-36 shrink-0 bg-gradient-to-br from-lc-olive to-lc-black"
        data-testid="nostr-profile-banner"
      >
        {/* An <img>, not a CSS background, so the banner gets the same
            no-referrer fetch as every other image someone else chose. */}
        {meta?.banner && <RemoteImage src={meta.banner} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        <div className={'profile-view-topbar absolute inset-x-3 top-3 z-10 flex ' + (settingsMode ? 'justify-end' : 'justify-between')}>
          {!settingsMode && (
            <IconButton tone="overlay" onClick={onClose} className="back-btn md:hidden" aria-label={t('common.back')}>
              <ChevronLeftIcon size={18} strokeWidth={2} />
            </IconButton>
          )}
          {settingsMode && onEditProfile && (
            <Button
              variant="pillSecondary"
              size="xs"
              className="ml-auto"
              onClick={onEditProfile}
              data-testid="edit-profile-btn"
            >
              {t('mobile.settings.editProfile')}
            </Button>
          )}
        </div>
      </div>

      {/*
        The strip beside the avatar used to be empty black. It's where a
        phone expects the profile's own controls: settings on your own
        profile, and the button that opens the composer.
      */}
      <div className="relative z-10 -mt-14 flex shrink-0 items-end justify-between gap-3 px-5">
        <UserAvatar
          pubkey={pubkey}
          picture={meta?.picture}
          size={28}
          name={displayName}
          alt={displayName}
          className="profile-view-avatar border-4 border-lc-black"
          initialClassName="text-3xl"
        />
        <div className="mb-2 flex items-center gap-2">
          {/*
            The ⋯ lives here on every profile. On your own it used to sit
            alone in a row under the bio, left-aligned, with its panel
            anchored `right-0`, so the dropdown opened off the left edge of
            the screen. Beside the other profile controls it lines up with
            them and the panel has room.
          */}
          <ProfileMenu pubkey={pubkey} displayName={displayName} canModerate={!isMe} />
          {isMe && mobile && (
            <IconButton
              tone="primary"
              size="11"
              onClick={onCreatePost}
              className="active:scale-95"
              aria-label={t('social.profileFeed.createPost')}
              data-testid="profile-create-post"
            >
              <EditIcon size={19} strokeWidth={2} />
            </IconButton>
          )}
          {onOpenSettings && (
            <IconButton
              tone="outline"
              size="11"
              onClick={onOpenSettings}
              className="active:scale-95"
              aria-label={t('settings.preferencesTitle')}
              title={t('settings.preferencesTitle')}
              data-testid="profile-settings-gear"
            >
              <GearIcon size={20} />
            </IconButton>
          )}
        </div>
      </div>

      <div className="profile-view-meta shrink-0 px-5 pb-1 pt-3">
        <div className="profile-view-name text-xl font-extrabold text-lc-white">{displayName}</div>
        {meta?.nip05 && <div className="profile-view-nip05 mt-1 text-xs text-lc-green">{meta.nip05}</div>}
        <div className="mt-1 flex min-w-0 items-center gap-2" data-testid="profile-npub-row">
          <div className="profile-view-npub min-w-0 truncate font-mono text-[10px] text-lc-muted">{profileShortNpub(pubkey)}</div>
          {settingsMode && (
            <Button
              variant="secondary"
              size="xs"
              className="shrink-0"
              onClick={onCopyNpub}
              data-testid="copy-npub"
            >
              {t('social.profileFeed.copyNpub')}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
