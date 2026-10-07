'use client';

import { useTranslations } from 'next-intl';
import { useParticipantTile } from '@/hooks/voice/room/useParticipantTile';
import MuteForMeButton from './MuteForMeButton';
import QualityDot from './QualityDot';
import VoiceAvatar from './VoiceAvatar';

/** An audio-only participant in the grid. */
export default function AudioTile({ pubkey, isLocal }: {
  pubkey: string;
  isLocal: boolean;
}) {
  const t = useTranslations();
  const { picture, name, speaking } = useParticipantTile(pubkey);
  return (
    <div
      className={
        'relative aspect-video sm:aspect-square w-44 sm:w-48 rounded-2xl overflow-hidden bg-gradient-to-br from-neutral-900 to-neutral-950 flex flex-col items-center justify-center p-3 transition-shadow group ' +
        (speaking ? 'ring-2 ring-lc-green shadow-[0_0_18px_rgba(180,249,83,0.35)]' : 'ring-1 ring-white/10')
      }
      data-testid="voice-participant"
    >
      <div className={'rounded-full p-1 ' + (isLocal ? 'ring-2 ring-lc-green' : 'ring-1 ring-white/10')}>
        <VoiceAvatar pubkey={pubkey} picture={picture} name={name} size={16} speaking={speaking} />
      </div>
      <div className="mt-2 text-xs text-white font-medium truncate max-w-full flex items-center gap-1.5">
        {!isLocal && <QualityDot pubkey={pubkey} />}
        <span className="truncate">{isLocal ? t('voice.tile.you', { name }) : name}</span>
      </div>
      {!isLocal && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <MuteForMeButton pubkey={pubkey} />
        </div>
      )}
    </div>
  );
}
