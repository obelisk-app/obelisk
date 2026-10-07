import { useUserMetadata } from '@/services/nostr-bridge';
import { participantName } from '@/utils/voice/participant-name';

/** A participant's picture and the name their tile shows. */
export function useParticipantProfile(pubkey: string) {
  const meta = useUserMetadata(pubkey);
  return { picture: meta?.picture, name: participantName(meta, pubkey) };
}
