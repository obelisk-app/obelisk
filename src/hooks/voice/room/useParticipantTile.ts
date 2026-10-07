import { useTileSpeaking } from '@/hooks/voice/room/useTileSpeaking';
import { useParticipantProfile } from '@/hooks/voice/room/useParticipantProfile';

/** What every audio and video tile shows of a participant: picture, name, and whether they are speaking. */
export function useParticipantTile(pubkey: string) {
  const { picture, name } = useParticipantProfile(pubkey);
  const speaking = useTileSpeaking(pubkey);
  return { picture, name, speaking };
}
