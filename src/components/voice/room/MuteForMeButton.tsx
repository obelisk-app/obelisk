'use client';

import { useTranslations } from 'next-intl';
import { useMuteForMeButton } from '@/hooks/voice/room/useMuteForMeButton';

/** Mute one person for me only (the voice store's local mute list); the call does not hear about it. */
export default function MuteForMeButton({ pubkey, compact = false }: { pubkey: string; compact?: boolean }) {
  const t = useTranslations();
  const { muted, toggle } = useMuteForMeButton(pubkey);
  return (
    <button
      type="button"
      onClick={toggle}
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
