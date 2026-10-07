'use client';

import { useTranslations } from 'next-intl';
import { useVideoTile } from '@/hooks/voice/room/useVideoTile';
import MuteForMeButton from './MuteForMeButton';
import FullscreenButton from './FullscreenButton';
import { PinIcon } from '@/assets/icons';

/** The main stage: one person's screen or camera, with mute-for-me, fullscreen and pin. */
export default function Stage({ pubkey, isLocal, kind, videoStream, pinned, onTogglePin }: {
  pubkey: string;
  isLocal: boolean;
  kind: 'screen' | 'camera';
  videoStream: MediaStream | null;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const t = useTranslations();
  const { videoRef, containerRef, ...vm } = useVideoTile(pubkey, videoStream);
  const { name, speaking } = vm;
  const label =
    kind === 'screen'
      ? isLocal ? t('voice.tile.youPresenting') : t('voice.tile.presenting', { name })
      : isLocal ? t('voice.tile.you', { name }) : name;
  return (
    <div
      ref={containerRef}
      className={
        'relative flex-1 min-h-0 rounded-xl overflow-hidden bg-black ring-1 ring-white/10 transition-shadow ' +
        (speaking ? 'ring-2 ring-lc-green shadow-[0_0_24px_rgba(180,249,83,0.4)]' : '')
      }
      data-testid={kind === 'screen' ? 'screen-share-area' : 'video-stage'}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={'w-full h-full object-contain ' + (kind === 'camera' && isLocal ? 'scale-x-[-1]' : '')}
      />
      <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/60 backdrop-blur text-[11px] text-lc-green border border-lc-green/30">
        <span className="font-medium">{label}</span>
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        {!isLocal && <MuteForMeButton pubkey={pubkey} />}
        <FullscreenButton targetRef={containerRef} />
        <button
          type="button"
          onClick={onTogglePin}
          title={t(pinned ? 'voice.tile.unpin' : 'voice.tile.pinToStage')}
          className={
            'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] backdrop-blur transition-colors ' +
            (pinned
              ? 'bg-lc-green/20 text-lc-green border border-lc-green/40'
              : 'bg-black/60 text-white/80 border border-white/15 hover:bg-black/80')
          }
        >
          <PinIcon size={11} strokeWidth={2} />
          {t(pinned ? 'voice.tile.pinned' : 'voice.tile.pin')}
        </button>
      </div>
    </div>
  );
}
