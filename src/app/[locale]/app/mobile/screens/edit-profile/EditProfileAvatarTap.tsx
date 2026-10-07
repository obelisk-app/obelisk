'use client';

import { useRef, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import FileInput from '@/components/ui/FileInput';
import { NameAvatar } from '../../avatar';

/** The avatar as a tap target that opens the image picker, with the upload tip beside it. */
export default function EditProfileAvatarTap({
  pubkey,
  name,
  image,
  uploading,
  onFile,
}: {
  pubkey: string;
  name: string;
  /** The picture to show: a picked file's preview or the picture URL; `''` for none. */
  image: string;
  uploading: boolean;
  onFile: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="edit-avatar-row">
      <button
        type="button"
        className={`edit-avatar-tap ${image ? '' : 'empty'} ${uploading ? 'uploading' : ''}`}
        onClick={() => inputRef.current?.click()}
        aria-label={t('mobile.settings.changeProfilePicture')}
        data-testid="edit-avatar-tap"
      >
        <NameAvatar pubkey={pubkey} name={name} picture={image} size={88} className="me-avatar" />
        <div className="edit-avatar-overlay">
          {uploading ? (
            <span className="edit-uploading-spinner" aria-hidden="true" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          )}
        </div>
        <FileInput ref={inputRef} accept="image/*" onChange={onFile} />
      </button>
      <div className="edit-avatar-tip">
        {t('mobile.settings.uploadTip')}
      </div>
    </div>
  );
}
