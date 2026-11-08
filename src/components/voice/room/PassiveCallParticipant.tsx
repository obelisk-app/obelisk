'use client';

import { useParticipantProfile } from '@/hooks/voice/room/useParticipantProfile';
import VoiceAvatar from './VoiceAvatar';

/** One face in the pre-join roster. */
export default function PassiveCallParticipant({ pubkey, cachedOnly, menu = false }: { pubkey: string; cachedOnly?: boolean; menu?: boolean }) {
  const { picture, name } = useParticipantProfile(pubkey, cachedOnly);
  return (
    <span
      className={menu ? "flex min-w-0 items-center gap-2 py-1 text-sm text-lc-muted" : "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-lc-white/85"}
      data-testid="passive-call-participant"
      title={pubkey}
    >
      <span className="shrink-0"><VoiceAvatar pubkey={pubkey} picture={picture} name={name} size={menu ? 6 : 5} /></span>
      <span className="truncate">{name}</span>
    </span>
  );
}
