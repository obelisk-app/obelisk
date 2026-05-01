import { describe, it, expect } from 'vitest';
import { scoreQuality, qualityColor } from './stats';

describe('scoreQuality', () => {
  it('returns unknown when no metrics are available', () => {
    expect(scoreQuality({ rttMs: null, loss: null, jitterMs: null })).toBe('unknown');
  });

  it('rates pristine links excellent', () => {
    expect(scoreQuality({ rttMs: 30, loss: 0, jitterMs: 5 })).toBe('excellent');
  });

  it('worst dimension wins', () => {
    expect(scoreQuality({ rttMs: 30, loss: 0.5, jitterMs: 5 })).toBe('poor');
    expect(scoreQuality({ rttMs: 250, loss: 0, jitterMs: 5 })).toBe('fair');
  });

  it('high jitter alone degrades the score', () => {
    expect(scoreQuality({ rttMs: 30, loss: 0, jitterMs: 200 })).toBe('poor');
  });
});

describe('qualityColor', () => {
  it('returns distinct colors per level', () => {
    const colors = new Set(['excellent', 'good', 'fair', 'poor', 'unknown'].map((l) =>
      qualityColor(l as 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'),
    ));
    expect(colors.size).toBe(5);
  });
});
