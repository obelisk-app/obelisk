import type { VoiceSignalPayload } from '@/types/voice/protocol';

/** Recognize both native offers and offers wrapped by the peer transport. */
export function isOffer(payload: VoiceSignalPayload): boolean {
  if (payload.type === 'offer') return true;
  return payload.type === 'peer' && (payload.peerSignal as { type?: string } | undefined)?.type === 'offer';
}
