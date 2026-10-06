import { describe, expect, it } from 'vitest';
import { nextPlaybackRate } from '@/utils/chat/voice-playback';

describe('nextPlaybackRate', () => {
  it('cycles playback speed 1 -> 1.5 -> 2 -> 1', () => {
    expect(nextPlaybackRate(1)).toBe(1.5);
    expect(nextPlaybackRate(1.5)).toBe(2);
    expect(nextPlaybackRate(2)).toBe(1);
  });
});
