'use client';

import { useTranslation } from '@/i18n/context';
import { TrashIcon } from '@/components/ui/icons';
import Spinner from '@/components/ui/Spinner';
import { VoiceMessage } from '../message/VoiceMessage';
import type { PendingVoice } from '@/utils/chat/dm/pending';
import IconButton from '@/components/ui/IconButton';

/** A recorded voice note waiting to be sent: playable, with an upload spinner and discard. */
export function DmVoiceDraft({ voice, onDiscard }: { voice: PendingVoice; onDiscard: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1" data-testid="dm-voice-draft">
      <VoiceMessage note={{ url: voice.previewUrl, durationSeconds: voice.durationSeconds }} compact />
      {!voice.meta && <Spinner size="sm" label={t('dm.file.uploading')} />}
      <IconButton
        tone="danger"
        onClick={onDiscard}
        aria-label={t('composer.discardVoice')}
        title={t('composer.discardVoice')}
      >
        <TrashIcon size={18} />
      </IconButton>
    </div>
  );
}
