'use client';

import { useTranslations } from 'next-intl';
import { useFullscreenButton } from '@/hooks/voice/room/useFullscreenButton';

/** Fullscreen for one tile, with its audio inside the same element. */
export default function FullscreenButton({ targetRef }: { targetRef: { current: HTMLElement | null } }) {
  const t = useTranslations();
  const { isFullscreen, toggle } = useFullscreenButton(targetRef);
  return (
    <button
      type="button"
      onClick={toggle}
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
