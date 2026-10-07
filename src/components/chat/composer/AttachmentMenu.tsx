'use client';

import { useTranslations } from 'next-intl';
import IconButton from '@/components/ui/buttons/IconButton';
import { useAttachmentMenu } from '@/hooks/chat/composer/useAttachmentMenu';
import { AttachmentMenuItem } from './AttachmentMenuItem';
import { AttachmentPickerInput } from './AttachmentPickerInput';

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
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </IconButton>
      {open && (
        <div className="absolute bottom-full left-0 z-40 mb-2 w-56 overflow-hidden rounded-2xl border border-lc-border bg-lc-dark p-2 text-sm text-lc-white shadow-2xl" role="menu">
          <AttachmentMenuItem label={t('chat.composer.document')} icon="document" onClick={() => pick('document')} />
          <AttachmentMenuItem label={t('chat.composer.photos')} icon="media" onClick={() => pick('media')} />
          <AttachmentMenuItem label={t('chat.composer.camera')} icon="camera" onClick={() => pick('camera')} />
          <AttachmentMenuItem label={t('chat.composer.contact')} icon="contact" onClick={contact} />
          <AttachmentMenuItem label={t('chat.composer.newSticker')} icon="sticker" onClick={newSticker} />
          <AttachmentMenuItem label={t('chat.composer.poll')} icon="poll" disabled />
          <AttachmentMenuItem label={t('chat.composer.event')} icon="event" disabled />
        </div>
      )}
    </div>
  );
}
