'use client';

/** Per-tile controls: mute-for-me (local only, via the voice store) and fullscreen. */
import { useTranslations } from 'next-intl';
import { useVoiceStore } from '@/store/voice';
import { toggleFullscreen } from '@/utils/fullscreen';
import { useFullscreenState } from '@/hooks/voice/useFullscreenState';

export function MuteForMeButton({ pubkey, compact = false }: { pubkey: string; compact?: boolean }) {
  const t = useTranslations();
  const muted = useVoiceStore((s) => !!s.localMutedPubkeys[pubkey]);
  const muteLocally = useVoiceStore((s) => s.muteLocally);
  const unmuteLocally = useVoiceStore((s) => s.unmuteLocally);
  return (
    <button
      type="button"
      onClick={(e) => {
        // Stops the click bubbling to the tile's pin handler.
        e.stopPropagation();
        if (muted) unmuteLocally(pubkey);
        else muteLocally(pubkey);
      }}
      title={t(muted ? 'voice.tile.unmuteForMe' : 'voice.tile.muteForMe')}
      data-testid="mute-for-me"
      data-muted={muted}
      className={
        'flex items-center justify-center rounded-md backdrop-blur transition-colors ' +
        (compact ? 'w-6 h-6 ' : 'px-2 py-1 ') +
        (muted
          ? 'bg-red-500/20 text-red-300 border border-red-400/40'
          : 'bg-black/60 text-white/80 border border-white/15 hover:bg-black/80')
      }
    >
      <svg width={compact ? 12 : 11} height={compact ? 12 : 11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {muted ? (
          <>
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
            <path d="M15 9.34V4a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
            <line x1="12" y1="19" x2="12" y2="23" />
          </>
        ) : (
          <>
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
          </>
        )}
      </svg>
    </button>
  );
}

export function FullscreenButton({ targetRef }: { targetRef: { current: HTMLElement | null } }) {
  const t = useTranslations();
  const isFullscreen = useFullscreenState(targetRef);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void toggleFullscreen(targetRef.current);
      }}
      title={t(isFullscreen ? 'voice.tile.exitFullscreen' : 'voice.tile.fullscreen')}
      data-testid="fullscreen-toggle"
      data-fullscreen={isFullscreen}
      className={
        'flex items-center justify-center w-7 h-7 rounded-md backdrop-blur transition-colors ' +
        (isFullscreen
          ? 'bg-lc-green/20 text-lc-green border border-lc-green/40'
          : 'bg-black/60 text-white/80 border border-white/15 hover:bg-black/80')
      }
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {isFullscreen ? (
          <>
            <path d="M8 3v3a2 2 0 0 1-2 2H3" />
            <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
            <path d="M3 16h3a2 2 0 0 1 2 2v3" />
            <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
          </>
        ) : (
          <>
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          </>
        )}
      </svg>
    </button>
  );
}
