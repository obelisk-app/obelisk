'use client';

/**
 * Banner + avatar editing, as one clickable social header.
 *
 * Three divergent implementations existed in the tree:
 *  - Desktop `EditProfileForm`: a read-only preview plus two URL text boxes
 *    with an "Upload" pill. The preview itself did nothing.
 *  - Mobile `EditProfileScreen`: tap-the-banner / tap-the-avatar overlays,
 *    file validation, object-URL previews, deferred upload. The good one.
 *  - `ChannelAppearanceInput`: combined preview, but upload-only buttons
 *    underneath and no URL fields at all.
 *
 * This is the merge: the banner and the avatar are each clickable with a
 * pencil overlay, AND the URL field stays visible underneath for manual
 * entry, so pasting a link still works.
 *
 * Uploads are deferred to save(): the same model mobile uses. Uploading on
 * pick would burn Blossom storage for every image a user tried and then
 * abandoned.
 */

import { useRef } from 'react';
import FileInput from '@/components/ui/forms/FileInput';
import RemoteImage from '@/components/ui/media/RemoteImage';
import UserAvatar from '@/components/ui/media/UserAvatar';
import { useTranslations } from 'next-intl';
import Spinner from '@/components/ui/feedback/Spinner';
import { useProfileAppearanceEditor } from '@/hooks/settings/account/useProfileAppearanceEditor';
import type { ProfileAppearanceValue } from '@/utils/settings/profile-image';
import ProfileUrlField from './ProfileUrlField';
import PencilIcon from './PencilIcon';

export type ImagePick = {
  /** The chosen file, or null when the user typed a URL instead. */
  file: File | null;
  /** Object URL for a picked file, or the typed URL. */
  preview: string;
};

export default function ProfileAppearanceEditor({
  pubkey,
  displayName,
  value,
  onChange,
  uploading = null,
  mobile = false,
}: {
  pubkey: string;
  displayName: string;
  value: ProfileAppearanceValue;
  onChange: (next: ProfileAppearanceValue) => void;
  /** Which target is mid-upload, so the overlay can show a spinner. */
  uploading?: 'picture' | 'banner' | null;
  mobile?: boolean;
}) {
  const t = useTranslations();
  const { error, bannerSrc, pictureSrc, picked, setUrl } = useProfileAppearanceEditor(value, onChange);
  const pictureInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  return (
    <div data-testid="profile-appearance-editor">
      <div className="relative mb-14 aspect-[4/1] overflow-visible rounded-xl border border-lc-border bg-lc-black">
        <button
          type="button"
          className="group absolute inset-0 h-full w-full overflow-hidden rounded-xl"
          onClick={() => bannerInput.current?.click()}
          aria-label={t('settings.profileAppearance.changeBanner')}
          data-testid="edit-banner-tap"
        >
          {bannerSrc ? (
            <RemoteImage src={bannerSrc} alt="" className="h-full w-full rounded-xl object-cover" />
          ) : (
            <div className="h-full w-full rounded-xl bg-gradient-to-br from-lc-olive to-lc-black" />
          )}
          <span className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-black/45 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
            {uploading === 'banner' ? <Spinner size="sm" /> : <PencilIcon />}
            {t(bannerSrc ? 'settings.profileAppearance.changeBanner' : 'settings.profileAppearance.addBanner')}
          </span>
        </button>

        <button
          type="button"
          className="group absolute -bottom-11 left-5 h-24 w-24 overflow-hidden rounded-full border-4 border-lc-dark bg-lc-card"
          onClick={() => pictureInput.current?.click()}
          aria-label={t('settings.profileAppearance.changeAvatar')}
          data-testid="edit-avatar-tap"
        >
          <UserAvatar
            pubkey={pubkey}
            picture={pictureSrc || null}
            size={22}
            name={displayName}
            alt={displayName}
            initialClassName="text-2xl"
          />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
            {uploading === 'picture' ? <Spinner size="sm" /> : <PencilIcon />}
          </span>
        </button>
      </div>

      <FileInput
        ref={bannerInput}
        accept="image/*"
        aria-label={t('settings.profileAppearance.changeBanner')}
        onChange={(event) => picked('banner', event.target)}
      />
      <FileInput
        ref={pictureInput}
        accept="image/*"
        aria-label={t('settings.profileAppearance.changeAvatar')}
        onChange={(event) => picked('picture', event.target)}
      />

      {error && <p className="mb-2 text-xs text-red-400" role="alert">{error}</p>}

      {/* The URL fields stay: uploading is the fast path, not the only one. */}
      <div className={mobile ? 'space-y-3' : 'space-y-3'}>
        <ProfileUrlField
          label={t('shell.user.field.picture')}
          value={value.pictureUrl}
          disabled={!!value.pictureFile}
          hint={value.pictureFile ? t('settings.profileAppearance.fileSelected') : undefined}
          onChange={(url) => setUrl('picture', url)}
          testId="picture-url"
        />
        <ProfileUrlField
          label={t('shell.user.field.banner')}
          value={value.bannerUrl}
          disabled={!!value.bannerFile}
          hint={value.bannerFile ? t('settings.profileAppearance.fileSelected') : undefined}
          onChange={(url) => setUrl('banner', url)}
          testId="banner-url"
        />
      </div>
    </div>
  );
}
