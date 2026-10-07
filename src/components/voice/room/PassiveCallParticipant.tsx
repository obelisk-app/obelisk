'use client';

import { useParticipantProfile } from '@/hooks/voice/room/useParticipantProfile';
import VoiceAvatar from './VoiceAvatar';

/** One face in the pre-join roster. */
export default function PassiveCallParticipant({ pubkey }: { pubkey: string }) {
  const { picture, name } = useParticipantProfile(pubkey);
  return (
    <span
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-lc-white/85"
      data-testid="passive-call-participant"
      title={pubkey}
    >
      <VoiceAvatar pubkey={pubkey} picture={picture} name={name} size={5} />
      <span className="truncate">{name}</span>
    </span>
  );
}
