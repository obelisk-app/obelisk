'use client';

import { useTranslations } from 'next-intl';
import ErrorState from '@/components/ui/feedback/ErrorState';
import FileInput from '@/components/ui/forms/FileInput';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { useChannelAppearanceInput } from '@/hooks/media/upload/useChannelAppearanceInput';

/** A channel's banner with its picture overlapping it, as the header shows them, and an upload button for each. */
export default function ChannelAppearanceInput({
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
  const { uploading, error, picked } = useChannelAppearanceInput(onPictureChange, onBannerChange);

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
              onChange={(e) => picked(e.target, kind)}
            />
          </label>
        ))}
      </div>
      {error && <ErrorState className="mt-1.5">{error}</ErrorState>}
    </div>
  );
}
