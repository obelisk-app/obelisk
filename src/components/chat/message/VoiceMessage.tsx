'use client';

import type { MessageVoiceNote } from '@/utils/media-tags/voice-note-tags';
import { useTranslation } from '@/i18n/context';
import { useFormat } from '@/i18n/useFormat';
import Range from '@/components/ui/Range';
import RemoteImage from '@/components/ui/RemoteImage';
import { formatAudioTime, VOICE_WAVEFORM } from './audio-time';
import { useVoicePlayback } from '@/hooks/chat/message/useVoicePlayback';

export function VoiceMessage({
  note,
  compact = false,
  authorPicture,
  timestamp,
  autoLoad = true,
}: {
  note: MessageVoiceNote;
  compact?: boolean;
  authorPicture?: string | null;
  timestamp?: number;
  /**
   * `false` renders the player but fetches nothing until play is pressed
   * (`preload="none"`): the press is the reader's consent to contact the
   * sender's host. See `src/services/remote-media.ts`.
   */
  autoLoad?: boolean;
}) {
  const { formatTime } = useFormat();
  const { t } = useTranslation();
  const {
    audioRef, playing, setPlaying, playbackRate, current, setCurrent,
    duration, setDuration, progress, toggle, cyclePlaybackRate, seek,
  } = useVoicePlayback(note.durationSeconds);

  return (
    <span
      className={`flex min-w-0 items-center ${compact ? "w-full gap-2" : "mt-1 min-h-20 w-[min(24rem,84vw)] gap-3 rounded-[18px] bg-[#202c33] px-3 py-2 shadow-sm"}`}
      data-testid="voice-message"
    >
      <audio
        ref={audioRef}
        src={note.url}
        preload={autoLoad ? "metadata" : "none"}
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => { if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration); }}
      />
      <button type="button" onClick={toggle} className={`flex shrink-0 items-center justify-center text-white ${compact ? "h-11 w-9" : "h-14 w-10"}`} aria-label={playing ? "Pause voice message" : "Play voice message"}>
        {playing ? (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
        ) : (
          <svg className="ml-0.5 h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="m7 4 13 8-13 8z" /></svg>
        )}
      </button>
      <span className={`min-w-0 flex-1 ${compact ? "" : "relative h-16 pr-2"}`}>
        <span className={compact ? "relative block h-9" : "absolute left-0 right-3 top-1/2 block h-9 -translate-y-1/2"} data-testid="voice-waveform">
          <span className="flex h-full items-center gap-[2px]" aria-hidden="true">
            {VOICE_WAVEFORM.map((height, index) => (
              <span
                key={index}
                className={`min-w-[2px] flex-1 rounded-full transition-colors ${((index + 1) / VOICE_WAVEFORM.length) <= progress ? "bg-[#53bdeb]" : "bg-[#7f8b90]"}`}
                style={{ height }}
              />
            ))}
          </span>
          <span
            className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#53bdeb]"
            style={{ left: `${progress * 100}%` }}
            data-testid="voice-progress-dot"
          />
          <Range
            variant="overlay"
            min={0}
            max={Math.max(duration, 1)}
            step={0.1}
            value={Math.min(current, Math.max(duration, 1))}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label={t('voiceNote.progress')}
          />
        </span>
        <span className={`flex justify-between text-[11px] leading-none text-[#aebac1] ${compact ? "mt-0.5" : "absolute bottom-0 left-0 right-3"}`} data-testid="voice-time-row">
          <span>{formatAudioTime(compact ? current : current || duration)}</span>
          {compact
            ? <span>{formatAudioTime(duration)}</span>
            : timestamp
              ? <span>{formatTime(timestamp, { hour: 'numeric', minute: '2-digit' })}</span>
              : null}
        </span>
      </span>
      {!compact && (
        <span className="relative h-14 w-14 shrink-0" data-testid="voice-avatar">
          {authorPicture ? (
            <RemoteImage src={authorPicture} alt={t('voiceNote.sender')} className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#6b7c85] text-white/80">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9a8 8 0 0 1 16 0Z" /></svg>
            </span>
          )}
          <span className="absolute -bottom-1 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-[#202c33] text-[#53bdeb]" data-testid="voice-mic-badge">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" /></svg>
          </span>
          {playing && (
            <button
              type="button"
              onClick={cyclePlaybackRate}
              className="absolute inset-0 z-10 flex items-center justify-center rounded-full bg-black/60 text-sm font-bold text-white backdrop-blur-[1px]"
              aria-label={`Playback speed ${playbackRate}x`}
              title={t('voiceNote.speed')}
            >
              {playbackRate}x
            </button>
          )}
        </span>
      )}
    </span>
  );
}
