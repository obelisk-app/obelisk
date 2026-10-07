import { describe, expect, it } from 'vitest';
import { hasMultipleCameras } from '@/utils/voice/camera-devices';

describe('hasMultipleCameras', () => {
  it('needs two video inputs; microphones and speakers do not count', () => {
    expect(hasMultipleCameras([{ kind: 'videoinput' }, { kind: 'audioinput' }, { kind: 'audiooutput' }])).toBe(false);
    expect(hasMultipleCameras([{ kind: 'videoinput' }, { kind: 'audioinput' }, { kind: 'videoinput' }])).toBe(true);
  });

  it('is false without a device list', () => {
    expect(hasMultipleCameras(undefined)).toBe(false);
    expect(hasMultipleCameras(null)).toBe(false);
    expect(hasMultipleCameras([])).toBe(false);
  });
});
