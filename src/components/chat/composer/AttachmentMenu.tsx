'use client';

import { useTranslations } from 'next-intl';
import IconButton from '@/components/ui/buttons/IconButton';
import { useAttachmentMenu } from '@/hooks/chat/composer/useAttachmentMenu';
import { AttachmentMenuItem } from './AttachmentMenuItem';
import { AttachmentPickerInput } from './AttachmentPickerInput';
import { CalendarIcon, CameraAltIcon, ContactIcon, DocumentIcon, PhotoIcon, PlusIcon, PollIcon, StickerIcon } from '@/assets/icons';

export function AttachmentMenu({
  disabled,
  onFiles,
  onContact,
  onNewSticker,
}: {
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  onContact: (value: string) => void;
  onNewSticker: () => void;
}) {
  const t = useTranslations();
  const {
    contact, newSticker, open, pick, rootRef, mediaRef, documentRef, cameraRef, toggle,
  } = useAttachmentMenu(onContact, onNewSticker);

  return (
    <div ref={rootRef} className="relative">
      <AttachmentPickerInput inputRef={mediaRef} label={t('chat.composer.photos')} accept="image/*,video/*" onFiles={onFiles} />
      <AttachmentPickerInput inputRef={documentRef} label={t('chat.composer.document')} onFiles={onFiles} />
      <AttachmentPickerInput inputRef={cameraRef} label={t('chat.composer.camera')} accept="image/*" capture="environment" onFiles={onFiles} />
      <IconButton
        disabled={disabled}
        onClick={toggle}
        aria-label={t('chat.composer.addAttachment')}
        aria-expanded={open}
      >
        <PlusIcon size={null} strokeWidth={2} className="h-5 w-5" />
      </IconButton>
      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-56 overflow-hidden rounded-2xl border border-lc-border bg-lc-dark p-2 text-sm text-lc-white shadow-2xl" role="menu">
          <AttachmentMenuItem label={t('chat.composer.document')} icon={<DocumentIcon size={null} className="h-[18px] w-[18px]" />} onClick={() => pick('document')} />
          <AttachmentMenuItem label={t('chat.composer.photos')} icon={<PhotoIcon size={null} className="h-[18px] w-[18px]" />} onClick={() => pick('media')} />
          <AttachmentMenuItem label={t('chat.composer.camera')} icon={<CameraAltIcon size={null} className="h-[18px] w-[18px]" />} onClick={() => pick('camera')} />
          <AttachmentMenuItem label={t('chat.composer.contact')} icon={<ContactIcon size={null} className="h-[18px] w-[18px]" />} onClick={contact} />
          <AttachmentMenuItem label={t('chat.composer.newSticker')} icon={<StickerIcon size={null} className="h-[18px] w-[18px]" />} onClick={newSticker} />
          <AttachmentMenuItem label={t('chat.composer.poll')} icon={<PollIcon size={null} className="h-[18px] w-[18px]" />} disabled />
          <AttachmentMenuItem label={t('chat.composer.event')} icon={<CalendarIcon size={null} className="h-[18px] w-[18px]" />} disabled />
        </div>
      )}
    </div>
  );
}
