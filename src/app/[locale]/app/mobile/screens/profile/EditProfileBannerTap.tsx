'use client';

import Button from '@/components/ui/buttons/Button';
import { useRef, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import FileInput from '@/components/ui/forms/FileInput';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { UploadIcon } from '@/assets/icons';

/** The profile banner as one big tap target that opens the image picker. */
export default function EditProfileBannerTap({
  image,
  uploading,
  onFile,
}: {
  /** The banner to show: a picked file's preview or the banner URL; `''` for none. */
  image: string;
  uploading: boolean;
  onFile: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Button
      variant="bare"
      type="button"
      className={`edit-banner-tap ${image ? '' : 'empty'} ${uploading ? 'uploading' : ''}`}
      onClick={() => inputRef.current?.click()}
      aria-label={t('mobile.settings.changeBannerImage')}
      data-testid="edit-banner-tap"
    >
      {image && <RemoteImage src={image} alt="" />}
      <div className="edit-banner-overlay">
        {uploading ? (
          <span className="edit-uploading-spinner" aria-hidden="true" />
        ) : (
          <>
            <UploadIcon size={null} strokeWidth={2} />
            <span>{image ? t('mobile.settings.changeBanner') : t('mobile.settings.addBanner')}</span>
          </>
        )}
      </div>
      <FileInput ref={inputRef} accept="image/*" onChange={onFile} />
    </Button>
  );
}
