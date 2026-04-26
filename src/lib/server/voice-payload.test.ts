// src/lib/server/voice-payload.test.ts
import { describe, it, expect } from 'vitest';
import { validateVoiceSignal } from './voice-payload';

describe('validateVoiceSignal', () => {
  it('accepts a valid SDP offer', () => {
    expect(validateVoiceSignal({
      to: 'npub_b',
      signal: { type: 'offer', sdp: 'v=0\no=...\n' },
    })).toBe(true);
  });

  it('accepts a valid SDP answer', () => {
    expect(validateVoiceSignal({
      to: 'npub_b',
      signal: { type: 'answer', sdp: 'v=0\no=...\n' },
    })).toBe(true);
  });

  it('accepts an ICE candidate', () => {
    expect(validateVoiceSignal({
      to: 'npub_b',
      signal: { type: 'ice', candidate: { candidate: '...', sdpMid: '0' } },
    })).toBe(true);
  });

  it('rejects missing `to`', () => {
    expect(validateVoiceSignal({
      signal: { type: 'offer', sdp: '...' },
    } as any)).toBe(false);
  });

  it('rejects unknown signal type', () => {
    expect(validateVoiceSignal({
      to: 'npub_b',
      signal: { type: 'mystery', sdp: '...' },
    } as any)).toBe(false);
  });

  it('rejects null signal', () => {
    expect(validateVoiceSignal({ to: 'npub_b', signal: null } as any)).toBe(false);
  });
});
