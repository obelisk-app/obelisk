import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useVoicePlayback } from '@/hooks/chat/message/useVoicePlayback';

describe('useVoicePlayback', () => {
  it('cycles playback speed on both the player and its rendered state', () => {
    const { result } = renderHook(() => useVoicePlayback(10));
    const audio = document.createElement('audio');
    result.current.audioRef.current = audio;
    for (const rate of [1.5, 2, 1]) {
      act(() => result.current.cyclePlaybackRate());
      expect(result.current.playbackRate).toBe(rate);
      expect(audio.playbackRate).toBe(rate);
    }
  });
});
