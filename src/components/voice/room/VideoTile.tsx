'use client';

import { useTranslations } from 'next-intl';
import { useVideoTile } from '@/hooks/voice/room/useVideoTile';
import MuteForMeButton from './MuteForMeButton';
import FullscreenButton from './FullscreenButton';
import QualityDot from './QualityDot';
import VoiceAvatar from './VoiceAvatar';

/** A camera tile in the grid or the rail; a click pins it when it is pinnable. */
export default function VideoTile({ pubkey, isLocal, videoStream, onPin, fit = 'cover', fillParent = false }: {
  pubkey: string;
  isLocal: boolean;
  videoStream: MediaStream | null;
  onPin?: () => void;
  fit?: 'cover' | 'contain';
  fillParent?: boolean;
}) {
  const t = useTranslations();
  const { videoRef, containerRef, ...vm } = useVideoTile(pubkey, videoStream, onPin);
  const { name, speaking } = vm;

  const fitClass = fit === 'contain' ? 'object-contain bg-black' : 'object-cover';
  // Use a div with role=button so we can host nested controls (mute,
  // fullscreen) - nested <button>s are invalid HTML.
  return (
    <div
      ref={containerRef}
      role={onPin ? 'button' : undefined}
      tabIndex={onPin ? 0 : undefined}
      onClick={onPin}
      onKeyDown={vm.onKeyDown}
      className={
        'relative rounded-xl overflow-hidden ring-1 ring-white/10 bg-neutral-950 group text-left transition ' +
        (onPin ? 'cursor-pointer hover:ring-lc-green/40 ' : '') +
        (speaking ? 'ring-2 ring-lc-green ' : '') +
        (fillParent ? 'w-full h-full' : 'w-full aspect-video')
      }
      data-testid="video-tile"
      title={onPin ? t('voice.tile.pinToStage') : undefined}
    >
      {videoStream ? (
        <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full ${fitClass} ${isLocal ? 'scale-x-[-1]' : ''}`} />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <VoiceAvatar pubkey={pubkey} picture={vm.picture} name={name} size={20} speaking={speaking} />
        </div>
      )}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {!isLocal && <MuteForMeButton pubkey={pubkey} />}
        {videoStream && <FullscreenButton targetRef={containerRef} />}
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 py-1.5 flex items-center gap-1.5">
        {!isLocal && <QualityDot pubkey={pubkey} />}
        <span className="text-xs text-white font-medium truncate">{isLocal ? t('voice.tile.you', { name }) : name}</span>
      </div>
    </div>
  );
}
