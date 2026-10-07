'use client';

import { useTranslations } from 'next-intl';
import { useFullscreenButton } from '@/hooks/voice/room/useFullscreenButton';
import { FullscreenExitIcon, FullscreenIcon } from '@/assets/icons';

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
      {isFullscreen ? <FullscreenExitIcon size={13} strokeWidth={2} /> : <FullscreenIcon size={13} strokeWidth={2} />}
    </button>
  );
}
