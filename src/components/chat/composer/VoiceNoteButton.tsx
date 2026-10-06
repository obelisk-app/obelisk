'use client';

import { useTranslation } from '@/i18n/context';
import { TrashIcon } from './composer-icons';
import { formatDuration } from './recording-time';
import { useVoiceRecorder } from './useVoiceRecorder';
import IconButton from '@/components/ui/IconButton';

export function VoiceNoteButton({
  disabled,
  onRecorded,
}: {
  disabled?: boolean;
  onRecorded: (file: File, durationSeconds: number) => void;
}) {
  const { t } = useTranslation();
  const { recording, elapsed, start, stop } = useVoiceRecorder(onRecorded);

  if (recording) {
    return (
      <span className="flex shrink-0 items-center gap-1" data-testid="voice-recording-controls">
        <IconButton
          tone="danger"
          onClick={() => stop(true)}
          aria-label={t('composer.discardRecording')}
          title={t('composer.discardRecording')}
        >
          <TrashIcon />
        </IconButton>
        <span className="flex items-center gap-2 px-1 font-mono text-sm text-red-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" aria-hidden="true" />
          <span data-testid="voice-recording-time">{formatDuration(elapsed)}</span>
        </span>
        <IconButton
          tone="dangerSoft"
          onClick={() => stop(false)}
          aria-label={t('composer.stopVoice')}
          title={t('composer.finishRecording')}
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
      aria-label={t('composer.recordVoice')}
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
      </svg>
    </IconButton>
  );
}
