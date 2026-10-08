'use client';

import { useTranslations } from 'next-intl';
import { VoiceNoteButton } from '../../composer/VoiceNoteButton';
import type { DmComposerState } from '@/hooks/chat/dm/composer/useDmComposer';
import IconButton from '@/components/ui/buttons/IconButton';
import { SendIcon } from '@/assets/icons';

/**
 * Send while there is anything to send (disabled until uploads finish);
 * otherwise the voice-note recorder, on threads that take files.
 */
export function DmSendControl({ state, variant }: { state: DmComposerState; variant: 'desktop' | 'mobile' }) {
  const t = useTranslations();
  const { canSend } = state;
  if (state.showSend) {
    const icon = (
      <SendIcon size={null} strokeWidth={2} className={variant === 'desktop' ? 'h-5 w-5' : undefined} />
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
