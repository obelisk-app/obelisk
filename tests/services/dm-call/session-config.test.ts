import { describe, expect, it } from 'vitest';
import { OfferGate, isOffer, sessionId } from '@/services/dm-call/session-config';
import type { VoiceSignalPayload } from '@/services/voice/types';

const offer = (session: string) => ({ type: 'offer', sessionId: session }) as unknown as VoiceSignalPayload;
const answer = (session: string) => ({ type: 'answer', sessionId: session }) as unknown as VoiceSignalPayload;

describe('session-config', () => {
  it('recognises a bare offer and one wrapped in a peer signal', () => {
    expect(isOffer(offer('a'))).toBe(true);
    expect(isOffer({ type: 'peer', peerSignal: { type: 'offer' } } as unknown as VoiceSignalPayload)).toBe(true);
    expect(isOffer(answer('a'))).toBe(false);
  });

  it('makes 16-hex session ids', () => {
    expect(sessionId()).toMatch(/^[0-9a-f]{16}$/);
  });

  it('drops late re-sends from a negotiation the other side replaced', () => {
    const gate = new OfferGate();
    expect(gate.admit(offer('old'), 1)).toBe(true);
    expect(gate.admit(offer('new'), 5)).toBe(true);
    expect(gate.admit(answer('old'), 3)).toBe(false);
    expect(gate.admit(offer('old'), 4)).toBe(false);
    expect(gate.admit(answer('new'), 6)).toBe(true);
  });
});
