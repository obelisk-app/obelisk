import { vi } from 'vitest';

/** Just enough Web Audio for the Stacker sound modules to run against. */
export function installFakeAudioContext() {
  const created: FakeContext[] = [];
  class FakeContext {
    state: AudioContextState = 'running';
    currentTime = 0;
    sampleRate = 100;
    destination = {};
    oscillators = 0;
    closed = false;
    constructor() { created.push(this); }
    resume = vi.fn(async () => {});
    close = vi.fn(async () => { this.closed = true; });
    createGain() {
      return {
        gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
        connect: vi.fn(),
      };
    }
    createOscillator() {
      this.oscillators += 1;
      return {
        type: 'sine',
        frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    }
    createBuffer(_channels: number, length: number) {
      return { getChannelData: () => new Float32Array(length) };
    }
    createBufferSource() { return { buffer: null as unknown, connect: vi.fn(), start: vi.fn() }; }
    createBiquadFilter() { return { type: 'lowpass', frequency: { value: 0 }, connect: vi.fn() }; }
  }
  vi.stubGlobal('AudioContext', FakeContext);
  return created;
}

/** An `Audio` whose `play()` resolves or rejects as the test says. */
export function installFakeAudioElement(play: () => Promise<void>) {
  const made: FakeAudio[] = [];
  class FakeAudio {
    volume = 1;
    muted = false;
    currentTime = 0;
    listeners = new Map<string, () => void>();
    constructor(public src: string) { made.push(this); }
    play = vi.fn(play);
    pause = vi.fn();
    addEventListener(type: string, fn: () => void) { this.listeners.set(type, fn); }
  }
  vi.stubGlobal('Audio', FakeAudio);
  return made;
}
