import { afterEach, describe, expect, it, vi } from 'vitest';
import { playClear, playSfx } from '@/lib/games/stacker/audio-sfx';
import { ensureAudio } from '@/lib/games/stacker/audio-graph';
import { disposeAudio } from '@/lib/games/stacker/audio';
import * as entry from '@/lib/games/stacker/audio';
import { installFakeAudioContext } from './audio-fakes';

afterEach(() => {
  disposeAudio();
  vi.unstubAllGlobals();
});

describe('stacker sound effects', () => {
  it('are silent, and harmless, before the graph exists', () => {
    expect(() => playSfx('clear4')).not.toThrow();
  });

  it('a quad is louder news than a single', () => {
    const created = installFakeAudioContext();
    ensureAudio();
    const ctx = created[0];
    playSfx('clear1');
    const single = ctx.oscillators;
    playSfx('clear4');
    expect(ctx.oscillators - single).toBeGreaterThan(single);
  });

  it('a spin plays the spin sound, and a combo adds its chime', () => {
    const created = installFakeAudioContext();
    ensureAudio();
    playClear(2, true, 0);
    const spinOnly = created[0].oscillators;
    playClear(2, true, 3);
    expect(created[0].oscillators - spinOnly).toBe(spinOnly + 1);
  });

  it('is what the audio entry point re-exports', () => {
    expect(entry.playSfx).toBe(playSfx);
    expect(entry.playClear).toBe(playClear);
  });
});
