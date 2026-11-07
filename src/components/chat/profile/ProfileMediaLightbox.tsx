'use client';

import { createPortal } from 'react-dom';
import { useProfileMediaLightbox } from '@/hooks/chat/profile/useProfileMediaLightbox';
import { useTranslations } from 'next-intl';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { CloseIcon } from '@/assets/icons';
import IconButton from '@/components/ui/buttons/IconButton';

export function ProfileMediaLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const t = useTranslations();
  const vm = useProfileMediaLightbox(url, onClose);

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('social.profileFeed.media')}
      onClick={vm.backdropClick}
      data-testid="profile-media-lightbox"
    >
      <IconButton tone="overlay" size="10" className="absolute right-4 top-4" onClick={onClose} aria-label={t('common.close')}>
        <CloseIcon size={20} />
      </IconButton>
      {vm.video ? (
        <video src={url} controls autoPlay className="max-h-full max-w-full object-contain" onClick={vm.stopClick} />
      ) : (
        <RemoteImage src={url} alt="" className="max-h-full max-w-full object-contain" onClick={vm.stopClick} />
      )}
    </div>, document.body
  );
}
