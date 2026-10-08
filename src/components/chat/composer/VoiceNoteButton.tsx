'use client';

import { useTranslations } from 'next-intl';
import { formatElapsed } from '@/utils/format/format-elapsed';
import { useVoiceRecorder } from '@/hooks/chat/composer/useVoiceRecorder';
import IconButton from '@/components/ui/buttons/IconButton';
import { MicIcon, TrashIcon } from '@/assets/icons';
import PulseDot from '@/components/ui/animations/PulseDot';

export function VoiceNoteButton({
  disabled,
  onRecorded,
}: {
  disabled?: boolean;
  onRecorded: (file: File, durationSeconds: number) => void;
}) {
  const t = useTranslations();
  const { recording, elapsed, start, stop } = useVoiceRecorder(onRecorded);

  if (recording) {
    return (
      <span className="flex shrink-0 items-center gap-1" data-testid="voice-recording-controls">
        <IconButton
          tone="danger"
          onClick={() => stop(true)}
          aria-label={t('chat.composer.discardRecording')}
          title={t('chat.composer.discardRecording')}
        >
          <TrashIcon size={null} className="h-5 w-5" />
        </IconButton>
        <span className="flex items-center gap-2 px-1 font-mono text-sm text-red-400">
          <PulseDot color="bg-red-400" />
          <span data-testid="voice-recording-time">{formatElapsed(elapsed * 1000)}</span>
        </span>
        <IconButton
          tone="dangerSoft"
          onClick={() => stop(false)}
          aria-label={t('chat.composer.stopVoice')}
          title={t('chat.composer.finishRecording')}
        >
          <span className="h-3 w-3 rounded-[3px] bg-current" aria-hidden="true" />
        </IconButton>
      </span>
    );
  }

  return (
    <IconButton
      disabled={disabled}
      onClick={() => void start()}
      aria-label={t('chat.composer.recordVoice')}
    >
      <MicIcon size={null} strokeWidth={2} className="h-5 w-5" />
    </IconButton>
  );
}
