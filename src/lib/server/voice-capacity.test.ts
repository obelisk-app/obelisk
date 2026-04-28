// src/lib/server/voice-capacity.test.ts
import { describe, it, expect } from 'vitest';
import { canAddCamera, canAddScreen } from './voice-capacity';

const limits = { maxCameras: 4, maxScreens: 2 };

describe('canAddCamera', () => {
  it('allows when channel has no sharers', () => {
    expect(canAddCamera(new Map(), 'ch1', 'pk1', limits)).toBe(true);
  });

  it('allows when under capacity', () => {
    const m = new Map([['ch1', new Set(['pk1', 'pk2'])]]);
    expect(canAddCamera(m, 'ch1', 'pk3', limits)).toBe(true);
  });

  it('denies when at capacity', () => {
    const m = new Map([['ch1', new Set(['pk1', 'pk2', 'pk3', 'pk4'])]]);
    expect(canAddCamera(m, 'ch1', 'pk5', limits)).toBe(false);
  });

  it('allows the same pubkey re-asserting (idempotent)', () => {
    const m = new Map([['ch1', new Set(['pk1', 'pk2', 'pk3', 'pk4'])]]);
    expect(canAddCamera(m, 'ch1', 'pk2', limits)).toBe(true);
  });
});

describe('canAddScreen', () => {
  it('allows when under capacity', () => {
    const m = new Map([['ch1', new Set(['pk1'])]]);
    expect(canAddScreen(m, 'ch1', 'pk2', limits)).toBe(true);
  });

  it('denies at capacity', () => {
    const m = new Map([['ch1', new Set(['pk1', 'pk2'])]]);
    expect(canAddScreen(m, 'ch1', 'pk3', limits)).toBe(false);
  });

  it('allows the same pubkey re-asserting', () => {
    const m = new Map([['ch1', new Set(['pk1', 'pk2'])]]);
    expect(canAddScreen(m, 'ch1', 'pk1', limits)).toBe(true);
  });
});
