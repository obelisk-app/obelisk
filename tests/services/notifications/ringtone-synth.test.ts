import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetReverb, schedule } from '@/services/notifications/ringtone-synth';
import { RINGTONE_DEFS } from '@/constants/notifications/ringtone-defs';

function fakeContext() {
  const node = () => ({ connect: vi.fn((n: unknown) => n) });
  const ac = {
    currentTime: 0,
    sampleRate: 100,
    destination: {},
    createOscillator: vi.fn(() => ({
      ...node(),
      type: 'sine',
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      start: vi.fn(),
      stop: vi.fn(),
    })),
    createGain: vi.fn(() => ({ ...node(), gain: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } })),
    createBiquadFilter: vi.fn(() => ({ ...node(), type: 'lowpass', frequency: { value: 0 } })),
    createDynamicsCompressor: vi.fn(node),
    createConvolver: vi.fn(() => ({ ...node(), buffer: null as unknown })),
    createBuffer: vi.fn((channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
      numberOfChannels: channels,
    })),
  };
  return ac;
}

describe('ringtone-synth', () => {
  beforeEach(() => resetReverb());

  it('starts one oscillator per partial per note', () => {
    const ac = fakeContext();
    schedule(ac as unknown as AudioContext, 'marimba', 'dm');
    const { instrument, phrases } = RINGTONE_DEFS.marimba;
    expect(ac.createOscillator).toHaveBeenCalledTimes(instrument.partials.length * phrases.dm.length);
  });

  it('builds the reverb room once per context and again for a new one', () => {
    const first = fakeContext();
    schedule(first as unknown as AudioContext, 'crystal', 'mention');
    schedule(first as unknown as AudioContext, 'crystal', 'reply');
    expect(first.createConvolver).toHaveBeenCalledTimes(1);

    const second = fakeContext();
    schedule(second as unknown as AudioContext, 'crystal', 'mention');
    expect(second.createConvolver).toHaveBeenCalledTimes(1);
  });

  it('still plays when the context cannot build a room', () => {
    const ac = fakeContext();
    const bare = { ...ac, createConvolver: undefined };
    schedule(bare as unknown as AudioContext, 'aurora', 'mention');
    expect(ac.createOscillator).toHaveBeenCalled();
  });
});
