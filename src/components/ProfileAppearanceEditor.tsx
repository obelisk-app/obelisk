'use client';

/**
 * Banner + avatar editing, as one clickable social header.
 *
 * Three divergent implementations existed in the tree:
 *  - Desktop `EditProfileForm` — a read-only preview plus two URL text boxes
 *    with an "Upload" pill. The preview itself did nothing.
 *  - Mobile `EditProfileScreen` — tap-the-banner / tap-the-avatar overlays,
 *    file validation, object-URL previews, deferred upload. The good one.
 *  - `ChannelAppearanceInput` — combined preview, but upload-only buttons
 *    underneath and no URL fields at all.
 *
 * This is the merge: the banner and the avatar are each clickable with a
 * pencil overlay, AND the URL field stays visible underneath for manual
 * entry, so pasting a link still works.
 *
 * Uploads are deferred to save() — the same model mobile uses. Uploading on
 * pick would burn Blossom storage for every image a user tried and then
 * abandoned.
 */

import { useEffect, useRef, useState } from 'react';
import UserAvatar from '@/components/UserAvatar';
import { useTranslation } from '@/i18n/context';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type ImagePick = {
  /** The chosen file, or null when the user typed a URL instead. */
  file: File | null;
  /** Object URL for a picked file, or the typed URL. */
  preview: string;
};

export type ProfileAppearanceValue = {
  pictureUrl: string;
  bannerUrl: string;
  pictureFile: File | null;
  bannerFile: File | null;
};

export function validateImage(file: File): 'not-image' | 'too-large' | null {
  if (!file.type.startsWith('image/')) return 'not-image';
  if (file.size > MAX_IMAGE_BYTES) return 'too-large';
  return null;
}

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
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<{ picture: string | null; banner: string | null }>({
    picture: null,
    banner: null,
  });
  const pictureInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  // Object URLs leak until revoked, and a user can swap the image many times
  // before saving.
  useEffect(() => () => {
    if (previews.picture) URL.revokeObjectURL(previews.picture);
    if (previews.banner) URL.revokeObjectURL(previews.banner);
  }, [previews.picture, previews.banner]);

  const pick = (target: 'picture' | 'banner', file: File | undefined) => {
    if (!file) return;
    const problem = validateImage(file);
    if (problem) {
      setError(t(problem === 'not-image' ? 'profileAppearance.notImage' : 'profileAppearance.tooLarge'));
      return;
    }
    setError(null);
    const objectUrl = URL.createObjectURL(file);
    setPreviews((current) => {
      const old = current[target];
      if (old) URL.revokeObjectURL(old);
      return { ...current, [target]: objectUrl };
    });
    onChange(target === 'picture'
      ? { ...value, pictureFile: file }
      : { ...value, bannerFile: file });
  };

  const setUrl = (target: 'picture' | 'banner', url: string) => {
    // Typing a URL supersedes a picked file — otherwise save() would upload
    // the file and silently ignore what the user just typed.
    setPreviews((current) => {
      const old = current[target];
      if (old) URL.revokeObjectURL(old);
      return { ...current, [target]: null };
    });
    onChange(target === 'picture'
      ? { ...value, pictureUrl: url, pictureFile: null }
      : { ...value, bannerUrl: url, bannerFile: null });
  };

  const bannerSrc = previews.banner || value.bannerUrl;
  const pictureSrc = previews.picture || value.pictureUrl;

  return (
    <div data-testid="profile-appearance-editor">
      <div className="relative mb-14 aspect-[4/1] overflow-visible rounded-xl border border-lc-border bg-lc-black">
        <button
          type="button"
          className="group absolute inset-0 h-full w-full overflow-hidden rounded-xl"
          onClick={() => bannerInput.current?.click()}
          aria-label={t('profileAppearance.changeBanner')}
          data-testid="edit-banner-tap"
        >
          {bannerSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bannerSrc} alt="" className="h-full w-full rounded-xl object-cover" />
          ) : (
            <div className="h-full w-full rounded-xl bg-gradient-to-br from-lc-olive to-lc-black" />
          )}
          <span className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-black/45 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
            {uploading === 'banner' ? <Spinner /> : <PencilIcon />}
            {t(bannerSrc ? 'profileAppearance.changeBanner' : 'profileAppearance.addBanner')}
          </span>
        </button>

        <button
          type="button"
          className="group absolute -bottom-11 left-5 h-24 w-24 overflow-hidden rounded-full border-4 border-lc-dark bg-lc-card"
          onClick={() => pictureInput.current?.click()}
          aria-label={t('profileAppearance.changeAvatar')}
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
            {uploading === 'picture' ? <Spinner /> : <PencilIcon />}
          </span>
        </button>
      </div>

      <input
        ref={bannerInput}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label={t('profileAppearance.changeBanner')}
        onChange={(event) => { pick('banner', event.target.files?.[0]); event.target.value = ''; }}
      />
      <input
        ref={pictureInput}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label={t('profileAppearance.changeAvatar')}
        onChange={(event) => { pick('picture', event.target.files?.[0]); event.target.value = ''; }}
      />

      {error && <p className="mb-2 text-xs text-red-400" role="alert">{error}</p>}

      {/* The URL fields stay — uploading is the fast path, not the only one. */}
      <div className={mobile ? 'space-y-3' : 'space-y-3'}>
        <UrlField
          label={t('user.field.picture')}
          value={value.pictureUrl}
          disabled={!!value.pictureFile}
          hint={value.pictureFile ? t('profileAppearance.fileSelected') : undefined}
          onChange={(url) => setUrl('picture', url)}
          testId="picture-url"
        />
        <UrlField
          label={t('user.field.banner')}
          value={value.bannerUrl}
          disabled={!!value.bannerFile}
          hint={value.bannerFile ? t('profileAppearance.fileSelected') : undefined}
          onChange={(url) => setUrl('banner', url)}
          testId="banner-url"
        />
      </div>
    </div>
  );
}

function UrlField({
  label,
  value,
  onChange,
  disabled,
  hint,
  testId,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  hint?: string;
  testId: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs uppercase tracking-wider text-lc-muted">{label}</label>
      <input
        value={disabled ? '' : value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={hint ?? 'https://…'}
        aria-label={label}
        className="w-full rounded-lg border border-lc-border bg-lc-black px-3 py-2 text-sm text-lc-white outline-none transition-colors focus:border-lc-green disabled:opacity-60"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-testid={testId}
      />
    </div>
  );
}

function PencilIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function Spinner() {
  return <span className="lc-spinner h-4 w-4" aria-hidden="true" />;
}
