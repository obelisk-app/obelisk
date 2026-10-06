'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import MessageMediaPicker from '../MessageMediaPicker';
import { AttachmentMenu, StickerIcon, VoiceNoteButton } from '../ComposerActions';
import { useDismiss } from '@/hooks/useDismiss';
import { MAX_PENDING } from '@/utils/chat/dm/pending';
import type { DmComposerState } from '@/hooks/chat/dm-composer/useDmComposer';
import IconButton from '@/components/ui/IconButton';

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
            <StickerIcon />
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
          <StickerIcon />
        </button>
      )}
    </>
  );
}

/**
 * Send while there is anything to send (disabled until uploads finish);
 * otherwise the voice-note recorder, on threads that take files.
 */
export function DmSendControl({ state, variant }: { state: DmComposerState; variant: 'desktop' | 'mobile' }) {
  const t = useTranslations();
  const { canSend, draft, files, voice } = state;
  if (canSend || draft.trim() || files.length > 0 || voice) {
    const icon = (
      <svg className={variant === 'desktop' ? 'h-5 w-5' : undefined} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 14-7-7 14-2-5-5-2z" /></svg>
    );
    if (variant === 'desktop') {
      return (
        <IconButton type="submit" tone="primary" disabled={!canSend} aria-label={t('common.send')} data-testid="dm-send">
          {icon}
        </IconButton>
      );
    }
    // The mobile skin's stylesheet button (`composer-send` in mobile-shell.css).
    return (
      <button type="button" onClick={() => state.send()} disabled={!canSend} className="composer-send" aria-label={t('common.send')} data-testid="dm-send">
        {icon}
      </button>
    );
  }
  return state.mediaAllowed ? <VoiceNoteButton onRecorded={state.onVoiceRecorded} /> : null;
}
