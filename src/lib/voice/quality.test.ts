import { describe, it, expect } from 'vitest';
import { getPreset, VIDEO_QUALITIES, MIC_CONSTRAINTS, AUDIO_MAX_BITRATE } from './quality';

describe('quality presets', () => {
  it('exposes auto + 30 fps + 60 fps tiers', () => {
    expect(VIDEO_QUALITIES).toEqual(['auto', '1080p60', '1080p', '720p60', '720p', '480p']);
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

  it('60 fps tiers ship higher bitrate + maxFramerate=60', () => {
    const p1080 = getPreset('1080p60');
    const p720 = getPreset('720p60');
    expect(p1080.maxFramerate).toBe(60);
    expect(p720.maxFramerate).toBe(60);
    // 60 fps tiers must out-bitrate their 30 fps siblings — smoothness costs.
    expect(p1080.maxBitrate!).toBeGreaterThan(getPreset('1080p').maxBitrate!);
    expect(p720.maxBitrate!).toBeGreaterThan(getPreset('720p').maxBitrate!);
  });

  it('post-bump bitrate caps land in the new ranges', () => {
    expect(getPreset('1080p').maxBitrate).toBe(6_000_000);
    expect(getPreset('720p').maxBitrate).toBe(3_500_000);
    expect(getPreset('480p').maxBitrate).toBe(1_500_000);
    expect(getPreset('1080p60').maxBitrate).toBe(8_000_000);
    expect(getPreset('720p60').maxBitrate).toBe(5_000_000);
  });

  it('mic constraints enable AEC/NS/AGC without forcing sample rate or channel count', () => {
    expect(MIC_CONSTRAINTS.echoCancellation).toBe(true);
    expect(MIC_CONSTRAINTS.noiseSuppression).toBe(true);
    expect(MIC_CONSTRAINTS.autoGainControl).toBe(true);
    // sampleRate / channelCount intentionally NOT set — even as advisory
    // hints they broke getUserMedia on real iOS/Android devices.
    expect(MIC_CONSTRAINTS.sampleRate).toBeUndefined();
    expect(MIC_CONSTRAINTS.channelCount).toBeUndefined();
  });

  it('audio bitrate cap is 256 kbps', () => {
    // Bumped from 128 kbps so voice stays crisp around incidental music
    // / ambient detail. Opus tops out at ~256 kbps for stereo material.
    expect(AUDIO_MAX_BITRATE).toBe(256_000);
  });
});
