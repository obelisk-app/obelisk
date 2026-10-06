import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MUSIC_TRACKS, currentTrack, setTrackListener, startMusic, stopMusic } from '@/lib/games/stacker/audio-music';
import { ensureAudio } from '@/lib/games/stacker/audio-graph';
import { disposeAudio, setMuted } from '@/lib/games/stacker/audio';
import { installFakeAudioContext, installFakeAudioElement } from './audio-fakes';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  setTrackListener(null);
  disposeAudio();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('stacker music', () => {
  it('plays a track from the playlist and names it', () => {
    installFakeAudioContext();
    const els = installFakeAudioElement(async () => {});
    const titles: string[] = [];
    setTrackListener((t) => titles.push(t));
    ensureAudio();
    startMusic();
    expect(els).toHaveLength(1);
    expect(MUSIC_TRACKS.map((t) => t.url)).toContain(els[0].src);
    expect(titles).toEqual([currentTrack().title]);
  });

  it('falls back to the synth bed when autoplay is refused', async () => {
    const created = installFakeAudioContext();
    installFakeAudioElement(async () => { throw new Error('NotAllowedError'); });
    ensureAudio();
    const ctx = created[0];
    startMusic();
    await vi.advanceTimersByTimeAsync(0);
    const before = ctx.oscillators;
    await vi.advanceTimersByTimeAsync(600);
    expect(ctx.oscillators).toBeGreaterThan(before);

    stopMusic();
    const stopped = ctx.oscillators;
    await vi.advanceTimersByTimeAsync(600);
    expect(ctx.oscillators).toBe(stopped);
  });

  it('setMuted mutes the recorded track as well as the graph', () => {
    installFakeAudioContext();
    const els = installFakeAudioElement(async () => {});
    ensureAudio();
    startMusic();
    setMuted(true);
    expect(els[0].muted).toBe(true);
  });
});
