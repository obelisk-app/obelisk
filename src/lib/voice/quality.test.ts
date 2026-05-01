import { describe, it, expect } from 'vitest';
import { getPreset, VIDEO_QUALITIES, MIC_CONSTRAINTS, AUDIO_MAX_BITRATE } from './quality';

describe('quality presets', () => {
  it('exposes the four canonical tiers', () => {
    expect(VIDEO_QUALITIES).toEqual(['auto', '1080p', '720p', '480p']);
  });

  it('auto leaves bitrate unset', () => {
    expect(getPreset('auto').maxBitrate).toBeNull();
    expect(getPreset('auto').maxHeight).toBeNull();
  });

  it('explicit tiers cap height + bitrate', () => {
    const p = getPreset('720p');
    expect(p.maxHeight).toBe(720);
    expect(p.maxBitrate).toBeGreaterThan(0);
    expect((p.constraints.height as { ideal: number }).ideal).toBe(720);
  });

  it('mic constraints request stereo + 48k + AEC/NS/AGC', () => {
    expect(MIC_CONSTRAINTS.echoCancellation).toBe(true);
    expect(MIC_CONSTRAINTS.noiseSuppression).toBe(true);
    expect(MIC_CONSTRAINTS.autoGainControl).toBe(true);
    expect(MIC_CONSTRAINTS.sampleRate).toBe(48000);
    expect(MIC_CONSTRAINTS.channelCount).toBe(2);
  });

  it('audio bitrate cap is 128 kbps', () => {
    expect(AUDIO_MAX_BITRATE).toBe(128_000);
  });
});
