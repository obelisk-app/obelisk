// src/lib/server/voice-payload.ts
// Shape validation for client-emitted voice signaling payloads. We don't
// inspect SDP content — just confirm the envelope so we don't relay garbage
// to the target peer.

export interface VoiceSignalPayload {
  to: string;
  signal:
    | { type: 'offer'; sdp: string }
    | { type: 'answer'; sdp: string }
    | { type: 'ice'; candidate: unknown };
}

export function validateVoiceSignal(p: unknown): p is VoiceSignalPayload {
  if (!p || typeof p !== 'object') return false;
  const obj = p as Record<string, unknown>;
  if (typeof obj.to !== 'string' || obj.to.length === 0) return false;
  const sig = obj.signal as Record<string, unknown> | null;
  if (!sig || typeof sig !== 'object') return false;
  if (sig.type === 'offer' || sig.type === 'answer') {
    return typeof sig.sdp === 'string';
  }
  if (sig.type === 'ice') {
    return sig.candidate !== undefined;
  }
  return false;
}
