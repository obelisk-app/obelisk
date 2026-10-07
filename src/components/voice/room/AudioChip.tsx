'use client';

import { useTranslations } from 'next-intl';
import { useParticipantTile } from '@/hooks/voice/room/useParticipantTile';
import MuteForMeButton from './MuteForMeButton';
import VoiceAvatar from './VoiceAvatar';

/** An audio-only participant as a chip under the video grid. */
export default function AudioChip({ pubkey, isLocal }: {
  pubkey: string;
  isLocal: boolean;
}) {
  const t = useTranslations();
  const { picture, name, speaking } = useParticipantTile(pubkey);
  return (
    <div
      className={
        'shrink-0 flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-white/5 transition-shadow ' +
        (speaking ? 'ring-2 ring-lc-green' : 'ring-1 ring-white/10')
      }
      data-testid="voice-participant"
    >
      <VoiceAvatar pubkey={pubkey} picture={picture} name={name} size={6} speaking={speaking} />
      <span className="text-xs text-white/85 truncate max-w-[10rem]">{isLocal ? t('voice.tile.you', { name }) : name}</span>
      {!isLocal && <MuteForMeButton pubkey={pubkey} compact />}
    </div>
  );
}
