import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureAudio, graph } from '@/lib/games/stacker/audio-graph';
import { disposeAudio } from '@/lib/games/stacker/audio';
import { installFakeAudioContext } from './audio-fakes';

afterEach(() => {
  disposeAudio();
  vi.unstubAllGlobals();
});

describe('stacker audio graph', () => {
  it('reports no audio when the browser has none', () => {
    vi.stubGlobal('AudioContext', undefined);
    expect(ensureAudio()).toBe(false);
    expect(graph.ctx).toBeNull();
  });

  it('builds the graph once and reuses it', () => {
    const created = installFakeAudioContext();
    expect(ensureAudio()).toBe(true);
    expect(ensureAudio()).toBe(true);
    expect(created).toHaveLength(1);
    expect(graph.master).not.toBeNull();
    expect(graph.musicGain).not.toBeNull();
    expect(graph.sfxGain).not.toBeNull();
  });

  it('resumes a suspended context', () => {
    const created = installFakeAudioContext();
    ensureAudio();
    created[0].state = 'suspended';
    ensureAudio();
    expect(created[0].resume).toHaveBeenCalled();
  });
});
