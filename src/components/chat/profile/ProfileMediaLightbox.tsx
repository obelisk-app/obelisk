'use client';

import { isVideoUrl } from '@/utils/attachments/attachments';
import { useTranslations } from 'next-intl';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { CloseIcon } from '@/components/ui/icons/icons';
import { useDismiss } from '@/hooks/common/useDismiss';
import IconButton from '@/components/ui/buttons/IconButton';

export function ProfileMediaLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const t = useTranslations();
  useDismiss({ onDismiss: onClose, outside: 'none' });

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('social.profileFeed.media')}
      onClick={onClose}
      data-testid="profile-media-lightbox"
    >
      <IconButton tone="overlay" size="10" className="absolute right-4 top-4" onClick={onClose} aria-label={t('common.close')}>
        <CloseIcon size={20} />
      </IconButton>
      {isVideoUrl(url) ? (
        <video src={url} controls autoPlay className="max-h-full max-w-full object-contain" onClick={(event) => event.stopPropagation()} />
      ) : (
        <RemoteImage src={url} alt="" className="max-h-full max-w-full object-contain" onClick={(event) => event.stopPropagation()} />
      )}
    </div>
  );
}
