'use client';

import { useVoiceStore } from '@/store/voice';

/** Whether the voice store currently hears this participant speaking. */
export function useTileSpeaking(pubkey: string): boolean {
  return useVoiceStore((s) => !!s.speakingPubkeys[pubkey]);
}
