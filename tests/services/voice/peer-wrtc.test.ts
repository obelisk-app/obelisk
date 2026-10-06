import { describe, expect, it, vi } from 'vitest';
import type SimplePeer from 'simple-peer';
import { feedSimplePeer } from '@/services/voice/peer-wrtc';
import type { VoiceSignalPayload } from '@/services/voice/types';

function fakeSimple() {
  const signal = vi.fn();
  return { simple: { signal } as unknown as SimplePeer.Instance, signal };
}

const wire = (p: Record<string, unknown>) => ({ sessionId: 's', seq: 1, ...p }) as unknown as VoiceSignalPayload;

describe('feedSimplePeer', () => {
  it('passes simple-peer its own signal blob unchanged', () => {
    const { simple, signal } = fakeSimple();
    const blob = { type: 'offer', sdp: 'v=0' };
    feedSimplePeer(simple, wire({ type: 'peer', peerSignal: blob }));
    expect(signal).toHaveBeenCalledWith(blob);
  });

  it('translates a legacy offer and a batch of candidates', () => {
    const { simple, signal } = fakeSimple();
    feedSimplePeer(simple, wire({ type: 'answer', sdp: 'v=0' }));
    feedSimplePeer(simple, wire({ type: 'ice', candidates: [{ candidate: 'a' }, { candidate: 'b' }] }));
    expect(signal.mock.calls).toEqual([
      [{ type: 'answer', sdp: 'v=0' }],
      [{ type: 'candidate', candidate: { candidate: 'a' } }],
      [{ type: 'candidate', candidate: { candidate: 'b' } }],
    ]);
  });

  it('ignores what is not simple-peer\'s, and an offer without sdp', () => {
    const { simple, signal } = fakeSimple();
    feedSimplePeer(simple, wire({ type: 'qualityhint' }));
    feedSimplePeer(simple, wire({ type: 'offer' }));
    expect(signal).not.toHaveBeenCalled();
  });

  it('lets simple-peer\'s refusal through for the caller to report', () => {
    const { simple, signal } = fakeSimple();
    signal.mockImplementation(() => { throw new Error('bad sdp'); });
    expect(() => feedSimplePeer(simple, wire({ type: 'offer', sdp: 'x' }))).toThrow('bad sdp');
  });
});
