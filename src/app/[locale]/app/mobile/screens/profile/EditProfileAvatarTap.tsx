'use client';

import { useRef, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import FileInput from '@/components/ui/forms/FileInput';
import { NameAvatar } from '../../common/NameAvatar';
import { CameraIcon } from '@/assets/icons';

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
            <CameraIcon size={null} strokeWidth={2} />
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
