'use client';

/**
 * Image URL input with a Blossom upload button: same visual pattern as the
 * legacy obelisk admin (preview thumbnail · URL input · "Upload" pill).
 *
 * Reuse anywhere a user can pick an image URL: profile picture/banner,
 * group icon/banner, emoji uploads, etc. Falls back gracefully when the
 * Blossom servers are unreachable: shows the upload error inline; the URL
 * field stays usable.
 */

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import ErrorState from '@/components/ui/feedback/ErrorState';
import FileInput from '@/components/ui/forms/FileInput';
import Input from '@/components/ui/forms/Input';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { useBlossomUpload } from '@/hooks/media/upload/useBlossomUpload';

interface Props {
  label: string;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  /** Thumbnail aspect: `square` for icons/avatars, `wide` for banners. */
  shape?: 'square' | 'wide';
  /** Optional helper text rendered under the input. */
  hint?: React.ReactNode;
  /** Restrict the file picker (default: any image). */
  accept?: string;
  /** Hide the inline thumbnail when a parent renders a larger combined preview. */
  showPreview?: boolean;
}

export function ChannelAppearanceInput({
  picture,
  banner,
  onPictureChange,
  onBannerChange,
}: {
  picture: string;
  banner: string;
  onPictureChange: (url: string) => void;
  onBannerChange: (url: string) => void;
}) {
  const t = useTranslations();
  const { uploading, error, upload } = useBlossomUpload<'picture' | 'banner'>();

  const onPick = (file: File, kind: 'picture' | 'banner') => upload(
    file,
    kind,
    kind === 'picture' ? onPictureChange : onBannerChange,
  );

  return (
    <div>
      <div
        className="relative mb-14 aspect-[4/1] overflow-visible rounded-xl border border-lc-border bg-lc-black"
        data-testid="channel-appearance-preview"
      >
        {banner && (
          <RemoteImage src={banner} alt={t('common.upload.bannerPreview')} className="h-full w-full rounded-xl object-cover" />
        )}
        <div className="absolute -bottom-11 left-5 h-24 w-24 overflow-hidden rounded-full border-4 border-lc-dark bg-lc-card">
          {picture && (
            <RemoteImage src={picture} alt={t('common.upload.avatarPreview')} className="h-full w-full object-cover" />
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {([
          ['picture', t('media.blossom.uploadPicture')],
          ['banner', t('media.blossom.uploadBanner')],
        ] as const).map(([kind, label]) => (
          <label key={kind} className="lc-pill lc-pill-secondary cursor-pointer whitespace-nowrap text-xs">
            {uploading === kind ? t('media.blossom.uploading') : label}
            <FileInput
              accept="image/*"
              aria-label={label}
              disabled={uploading !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onPick(file, kind);
                e.target.value = '';
              }}
            />
          </label>
        ))}
      </div>
      {error && <ErrorState className="mt-1.5">{error}</ErrorState>}
    </div>
  );
}

export default function BlossomImageInput({
  label,
  value,
  onChange,
  placeholder,
  shape = 'square',
  hint,
  accept = 'image/*',
  showPreview = true,
}: Props) {
  const t = useTranslations();
  const urlId = useId();
  const { uploading: slot, error, upload } = useBlossomUpload<'file'>();
  const uploading = slot !== null;

  const onPick = (file: File) => upload(file, 'file', onChange);

  const thumbCls =
    shape === 'wide'
      ? 'w-24 h-12 rounded-lg object-cover bg-lc-black border border-lc-border'
      : 'w-12 h-12 rounded-lg object-cover bg-lc-black border border-lc-border';
  const placeholderCls =
    shape === 'wide'
      ? 'w-24 h-12 rounded-lg bg-lc-black border border-lc-border'
      : 'w-12 h-12 rounded-lg bg-lc-black border border-lc-border';

  return (
    <div>
      <label htmlFor={urlId} className="block text-xs text-lc-muted mb-1.5 uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-3">
        {showPreview && (value ? (
          <RemoteImage src={value} alt="" className={thumbCls} />
        ) : (
          <div className={placeholderCls} />
        ))}
        <Input
          id={urlId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? t('media.blossom.urlPlaceholder')}
          className="flex-1 transition-colors"
        />
        <label className="lc-pill lc-pill-secondary text-xs cursor-pointer whitespace-nowrap">
          {t(uploading ? 'media.blossom.uploading' : 'media.blossom.upload')}
          <FileInput
            accept={accept}
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPick(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {error && <ErrorState className="mt-1.5">{error}</ErrorState>}
      {hint && <p className="mt-1.5 text-[11px] text-lc-muted">{hint}</p>}
    </div>
  );
}
