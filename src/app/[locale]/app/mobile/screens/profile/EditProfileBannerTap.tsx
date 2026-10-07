'use client';

import { useRef, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import FileInput from '@/components/ui/forms/FileInput';
import RemoteImage from '@/components/ui/media/RemoteImage';

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
    <button
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>{image ? t('mobile.settings.changeBanner') : t('mobile.settings.addBanner')}</span>
          </>
        )}
      </div>
      <FileInput ref={inputRef} accept="image/*" onChange={onFile} />
    </button>
  );
}
