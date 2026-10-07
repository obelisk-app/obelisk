'use client';

import type { MessageVoiceNote } from '@/utils/media/tags/voice-note-tags';
import { useTranslations } from 'next-intl';
import { VoiceMessage } from '../message/VoiceMessage';
import IconButton from '@/components/ui/buttons/IconButton';
import { TrashNarrowIcon } from '@/assets/icons';

export function VoiceNoteDraft({
  note,
  onDiscard,
}: {
  note: MessageVoiceNote;
  onDiscard: () => void;
}) {
  const t = useTranslations();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1" data-testid="voice-note-draft">
      <VoiceMessage note={note} compact />
      <IconButton
        tone="danger"
        onClick={onDiscard}
        aria-label={t('chat.composer.discardVoice')}
        title={t('chat.composer.discardVoice')}
      >
        <TrashNarrowIcon size={null} className="h-5 w-5" />
      </IconButton>
    </div>
  );
}
