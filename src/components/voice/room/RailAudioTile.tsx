'use client';

import { useTranslations } from 'next-intl';
import { useParticipantTile } from '@/hooks/voice/room/useParticipantTile';
import MuteForMeButton from './MuteForMeButton';
import VoiceAvatar from './VoiceAvatar';

/** An audio-only participant in the rail. */
export default function RailAudioTile({ pubkey, isLocal }: {
  pubkey: string;
  isLocal: boolean;
}) {
  const t = useTranslations();
  const { picture, name, speaking } = useParticipantTile(pubkey);
  return (
    <div
      className={
        'relative shrink-0 w-40 md:w-full aspect-video rounded-xl bg-neutral-900 flex flex-col items-center justify-center gap-1.5 p-2 group transition-shadow ' +
        (speaking ? 'ring-2 ring-lc-green' : 'ring-1 ring-white/10')
      }
      data-testid="voice-participant"
    >
      <VoiceAvatar pubkey={pubkey} picture={picture} name={name} size={10} speaking={speaking} />
      <span className="text-[11px] text-white/85 truncate max-w-full px-1">{isLocal ? t('voice.tile.you', { name }) : name}</span>
      {!isLocal && (
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <MuteForMeButton pubkey={pubkey} compact />
        </div>
      )}
    </div>
  );
}
