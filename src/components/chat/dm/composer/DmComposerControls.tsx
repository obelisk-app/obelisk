'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import MessageMediaPicker from '../../picker/MessageMediaPicker';
import { AttachmentMenu } from '../../composer/AttachmentMenu';
import { useDismiss } from '@/hooks/common/useDismiss';
import { MAX_PENDING } from '@/utils/chat/dm/pending';
import type { DmComposerState } from '@/hooks/chat/dm/composer/useDmComposer';
import IconButton from '@/components/ui/buttons/IconButton';
import { StickerIcon } from '@/assets/icons';

/**
 * Attach and picker buttons left of the input. Desktop opens the picker as
 * a popover that a press outside closes; mobile opens it as a sheet (drawn
 * by DmComposer).
 */
export function DmComposerActions({ state, variant }: { state: DmComposerState; variant: 'desktop' | 'mobile' }) {
  const t = useTranslations();
  const pickerRef = useRef<HTMLDivElement>(null);
  useDismiss({ refs: [pickerRef], onDismiss: state.closePicker, enabled: state.pickerOpen && variant === 'desktop', escape: 'ignore' });
  if (state.voice) return null;
  return (
    <>
      {state.mediaAllowed && (
        <AttachmentMenu
          disabled={state.files.length >= MAX_PENDING}
          onFiles={state.addFiles}
          onContact={state.appendContact}
          onNewSticker={() => state.openPicker('sticker')}
        />
      )}
      {variant === 'desktop' ? (
        <div ref={pickerRef} className="relative">
          <IconButton
            onClick={state.togglePicker}
            aria-label={t('mobile.composer.openPicker')}
            aria-haspopup="dialog"
            aria-expanded={state.pickerOpen}
          >
            <StickerIcon size={null} className="h-5 w-5" />
          </IconButton>
          {state.pickerOpen && (
            <MessageMediaPicker
              initialTab={state.pickerTab}
              customEmojis={state.pickerEmojis}
              onPick={state.onPick}
              onClose={state.closePicker}
            />
          )}
        </div>
      ) : (
        <button
          type="button"
          className="composer-emoji"
          aria-label={t('mobile.composer.openPicker')}
          onClick={() => state.openPicker('emoji')}
        >
          <StickerIcon size={null} className="h-5 w-5" />
        </button>
      )}
    </>
  );
}
