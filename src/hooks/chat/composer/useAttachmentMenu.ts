'use client';

import { useRef, useState, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { useDismiss } from '@/hooks/common/useDismiss';
import { promptForContact } from '@/services/chat/composer/contact-prompt';

export type AttachmentPicker = 'media' | 'document' | 'camera';

/**
 * The composer's attachment menu: open or closed (a press outside closes
 * it), the three hidden pickers it opens, and the contact and sticker
 * entries. Every entry closes the menu first.
 */
export function useAttachmentMenu(onContact: (value: string) => void, onNewSticker: () => void) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  useDismiss({ refs: [rootRef], onDismiss: () => setOpen(false), enabled: open, escape: 'ignore' });

  const pickers: Record<AttachmentPicker, RefObject<HTMLInputElement | null>> = {
    media: mediaRef,
    document: documentRef,
    camera: cameraRef,
  };

  return {
    open,
    rootRef,
    mediaRef,
    documentRef,
    cameraRef,
    toggle: () => setOpen((value) => !value),
    pick: (which: AttachmentPicker) => {
      setOpen(false);
      pickers[which].current?.click();
    },
    contact: () => {
      setOpen(false);
      const value = promptForContact(t('chat.composer.contactPrompt'));
      if (value) onContact(value);
    },
    newSticker: () => {
      setOpen(false);
      onNewSticker();
    },
  };
}
