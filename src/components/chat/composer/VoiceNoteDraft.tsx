'use client';

import type { MessageVoiceNote } from '@/utils/media-tags/voice-note-tags';
import { useTranslation } from '@/i18n/context';
import { VoiceMessage } from '../message/VoiceMessage';
import { TrashIcon } from './composer-icons';
import IconButton from '@/components/ui/IconButton';

export function VoiceNoteDraft({
  note,
  onDiscard,
}: {
  note: MessageVoiceNote;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1" data-testid="voice-note-draft">
      <VoiceMessage note={note} compact />
      <IconButton
        tone="danger"
        onClick={onDiscard}
        aria-label={t('composer.discardVoice')}
        title={t('composer.discardVoice')}
      >
        <TrashIcon />
      </IconButton>
    </div>
  );
}
