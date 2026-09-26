import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetNotificationSoundForTests,
  playNotificationSound,
  previewRingtone,
  RINGTONES,
  SOUND_MIN_GAP_MS,
} from './sound';
import { setPreference } from '@/lib/preferences';

function installFakeAudio(state: AudioContextState = 'running') {
  const oscillators: Array<{ start: ReturnType<typeof vi.fn> }> = [];
  class FakeCtx {
    state = state;
    currentTime = 0;
    destination = {};
    resume = vi.fn(async () => { this.state = 'running'; });
    createOscillator() {
      const osc = {
        type: 'sine',
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: (n: unknown) => n,
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    }
    createGain() {
      return {
        gain: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: (n: unknown) => n,
      };
    }
    createBiquadFilter() {
      return { type: 'lowpass', frequency: { value: 0 }, connect: (n: unknown) => n };
    }
    createDynamicsCompressor() {
      return { connect: (n: unknown) => n };
    }
  }
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
  return oscillators;
}

describe('playNotificationSound', () => {
  beforeEach(() => __resetNotificationSoundForTests());
  afterEach(() => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
  });

  it('is a no-op without WebAudio', () => {
    expect(playNotificationSound('mention', 10_000)).toBe('unavailable');
  });

  it('schedules every partial of every note, and the phrases differ per kind', () => {
    setPreference('notificationRingtone', 'crystal');
    const oscs = installFakeAudio();
    expect(playNotificationSound('mention', 10_000)).toBe('played');
    const mention = oscs.length;
    expect(mention).toBeGreaterThan(2); // layered partials, not bare beeps
    expect(playNotificationSound('dm', 10_000 + SOUND_MIN_GAP_MS)).toBe('played');
    expect(oscs.length - mention).toBe(mention * 2); // 4-note arpeggio vs 2-note motif
  });

  it('uses the ringtone chosen in preferences', () => {
    const oscs = installFakeAudio();
    setPreference('notificationRingtone', 'bubble');
    playNotificationSound('mention', 10_000);
    const bubble = oscs.length;
    setPreference('notificationRingtone', 'crystal');
    playNotificationSound('mention', 10_000 + SOUND_MIN_GAP_MS);
    expect(oscs.length - bubble).not.toBe(bubble);
  });

  it('every ringtone plays every kind', () => {
    const oscs = installFakeAudio();
    for (const id of RINGTONES) {
      for (const kind of ['mention', 'reply', 'dm'] as const) {
        const before = oscs.length;
        expect(previewRingtone(id, kind)).toBe(true);
        expect(oscs.length).toBeGreaterThan(before);
      }
    }
  });

  it('previews bypass the burst throttle', () => {
    const oscs = installFakeAudio();
    previewRingtone('marimba');
    previewRingtone('marimba');
    expect(oscs.length).toBeGreaterThan(0);
    const one = oscs.length / 2;
    expect(oscs.length).toBe(one * 2);
  });

  it('collapses bursts inside the minimum gap', () => {
    const oscs = installFakeAudio();
    expect(playNotificationSound('reply', 10_000)).toBe('played');
    const n = oscs.length;
    // Collapsed into the chime that just played — not "blocked".
    expect(playNotificationSound('reply', 10_000 + SOUND_MIN_GAP_MS - 1)).toBe('played');
    expect(oscs).toHaveLength(n);
  });

  it('resumes a suspended context immediately once the page has had a gesture', async () => {
    const oscs = installFakeAudio('suspended');
    vi.stubGlobal('navigator', { ...navigator, userActivation: { hasBeenActive: true } });
    expect(playNotificationSound('mention', 10_000)).toBe('played');
    expect(oscs).toHaveLength(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(oscs.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it('reports blocked — and never plays late — before any gesture on the page', async () => {
    const oscs = installFakeAudio('suspended');
    vi.stubGlobal('navigator', { ...navigator, userActivation: { hasBeenActive: false } });
    expect(playNotificationSound('mention', 10_000)).toBe('blocked');
    await Promise.resolve();
    await Promise.resolve();
    expect(oscs).toHaveLength(0);
    // Not throttled by the blocked attempt.
    vi.stubGlobal('navigator', { ...navigator, userActivation: { hasBeenActive: true } });
    expect(playNotificationSound('mention', 10_100)).toBe('played');
    vi.unstubAllGlobals();
  });
});
