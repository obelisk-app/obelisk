import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchMultipleCameras } from '@/services/voice/camera-watch';

const nav = globalThis.navigator as unknown as { mediaDevices?: unknown };
const prev = nav.mediaDevices;

afterEach(() => {
  nav.mediaDevices = prev;
  vi.restoreAllMocks();
});

describe('watchMultipleCameras', () => {
  it('answers now and again on every devicechange, then stops listening', async () => {
    let cams: Array<{ kind: string }> = [{ kind: 'videoinput' }];
    let listener: (() => void) | null = null;
    const removeEventListener = vi.fn();
    nav.mediaDevices = {
      enumerateDevices: async () => cams,
      addEventListener: (type: string, cb: () => void) => { if (type === 'devicechange') listener = cb; },
      removeEventListener,
    };
    const onResult = vi.fn();
    const stop = watchMultipleCameras(onResult);
    await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    cams = [{ kind: 'videoinput' }, { kind: 'videoinput' }];
    listener!();
    await vi.waitFor(() => expect(onResult).toHaveBeenLastCalledWith(true));
    stop();
    expect(removeEventListener).toHaveBeenCalledWith('devicechange', listener);
  });

  it('delivers nothing once stopped', async () => {
    let release: (v: Array<{ kind: string }>) => void = () => {};
    nav.mediaDevices = { enumerateDevices: () => new Promise((resolve) => { release = resolve; }) };
    const onResult = vi.fn();
    const stop = watchMultipleCameras(onResult);
    stop();
    release([{ kind: 'videoinput' }, { kind: 'videoinput' }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(onResult).not.toHaveBeenCalled();
  });

  it('logs a failed enumeration and leaves the answer alone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    nav.mediaDevices = { enumerateDevices: async () => { throw new Error('blocked'); } };
    const onResult = vi.fn();
    watchMultipleCameras(onResult)();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(
      '[voice] enumerateDevices failed; the switch-camera button stays hidden', expect.any(Error),
    ));
    expect(onResult).not.toHaveBeenCalled();
  });

  it('copes with a browser that has no media devices', () => {
    nav.mediaDevices = undefined;
    const onResult = vi.fn();
    expect(() => watchMultipleCameras(onResult)()).not.toThrow();
  });
});
