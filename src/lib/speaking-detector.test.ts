import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SpeakingDetector } from './speaking-detector';

// Scripted RMS sequence. Each tick pops one value (the Uint8-quantized
// deviation from 128 we want the analyser to report). Values stay until
// the sequence is exhausted, then hold the last value — simpler than
// replenishing for the tail of a test.
function scriptedAnalyser(sequence: number[]): {
  analyser: AnalyserNode;
  source: MediaStreamAudioSourceNode;
  ctx: AudioContext;
  advance: () => void;
} {
  let idx = 0;

  const analyser = {
    fftSize: 512,
    smoothingTimeConstant: 0.2,
    getByteTimeDomainData: (buf: Uint8Array) => {
      const v = sequence[Math.min(idx, sequence.length - 1)] ?? 0;
      for (let i = 0; i < buf.length; i++) buf[i] = 128 + v;
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as AnalyserNode;

  const source = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as MediaStreamAudioSourceNode;

  const ctx = {
    createMediaStreamSource: () => source,
    createAnalyser: () => analyser,
    state: 'running',
  } as unknown as AudioContext;

  return {
    analyser,
    source,
    ctx,
    advance: () => { idx++; },
  };
}

describe('SpeakingDetector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('emits speaking=true when RMS crosses the threshold', () => {
    // Deviation of 40/128 → RMS ≈ 0.31, well above default 0.02.
    const { ctx, advance } = scriptedAnalyser([0, 40]);
    const listener = vi.fn();
    const stream = {} as MediaStream;
    const now = vi.fn(() => 1000);
    const det = new SpeakingDetector(stream, listener, { audioContext: ctx, now });
    det.start();
    // First tick (RMS=0): not speaking.
    vi.advanceTimersByTime(50);
    expect(listener).not.toHaveBeenCalled();
    advance();
    // Second tick (RMS high): transitions to speaking.
    vi.advanceTimersByTime(50);
    expect(listener).toHaveBeenCalledWith(true);
    det.stop();
  });

  it('stays speaking for the hangover window after RMS drops', () => {
    const { ctx, advance } = scriptedAnalyser([40, 0]);
    const listener = vi.fn();
    let t = 1000;
    const det = new SpeakingDetector({} as MediaStream, listener, {
      audioContext: ctx,
      hangoverMs: 300,
      now: () => t,
    });
    det.start();
    t = 1000;
    vi.advanceTimersByTime(50);
    expect(listener).toHaveBeenLastCalledWith(true);
    advance(); // RMS drops to 0
    // 100 ms later: still speaking (hangover holds)
    t = 1100;
    vi.advanceTimersByTime(50);
    expect(listener).toHaveBeenCalledTimes(1);
    // 400 ms after last-above (hangover expired): should flip to false.
    t = 1401;
    vi.advanceTimersByTime(50);
    expect(listener).toHaveBeenLastCalledWith(false);
    det.stop();
  });

  it('stop() halts further listener calls', () => {
    const { ctx, advance } = scriptedAnalyser([40, 40, 40]);
    const listener = vi.fn();
    const det = new SpeakingDetector({} as MediaStream, listener, {
      audioContext: ctx,
      now: () => 1000,
    });
    det.start();
    vi.advanceTimersByTime(50);
    expect(listener).toHaveBeenCalledTimes(1);
    det.stop();
    advance();
    vi.advanceTimersByTime(500);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('is idempotent on double start/stop', () => {
    const { ctx } = scriptedAnalyser([0]);
    const listener = vi.fn();
    const det = new SpeakingDetector({} as MediaStream, listener, {
      audioContext: ctx,
      now: () => 1000,
    });
    det.start();
    det.start();
    det.stop();
    det.stop();
    expect(() => { vi.advanceTimersByTime(200); }).not.toThrow();
  });

  it('does not flicker on a brief silence within the hangover window', () => {
    // Speak, brief gap (<hangover), speak again — should stay "speaking" throughout.
    const { ctx, advance } = scriptedAnalyser([40, 0, 40, 40]);
    const listener = vi.fn();
    let t = 1000;
    const det = new SpeakingDetector({} as MediaStream, listener, {
      audioContext: ctx,
      hangoverMs: 400,
      now: () => t,
    });
    det.start();
    t = 1000;
    vi.advanceTimersByTime(50);
    expect(listener).toHaveBeenLastCalledWith(true);
    advance(); t = 1100; vi.advanceTimersByTime(50); // silence, within hangover
    advance(); t = 1200; vi.advanceTimersByTime(50); // speech resumes
    advance(); t = 1300; vi.advanceTimersByTime(50); // more speech
    // Listener should have only fired once (the initial true). No false edge.
    expect(listener).toHaveBeenCalledTimes(1);
    det.stop();
  });
});
