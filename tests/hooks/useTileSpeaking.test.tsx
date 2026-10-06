import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTileSpeaking } from '@/hooks/useTileSpeaking';
import { useVoiceStore } from '@/store/voice';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

describe('useTileSpeaking', () => {
  beforeEach(() => useVoiceStore.setState({ speakingPubkeys: {} }));

  it('is false until the store hears the participant, then follows it', () => {
    const { result } = renderHook(() => useTileSpeaking(A));
    expect(result.current).toBe(false);
    act(() => useVoiceStore.getState().setSpeaking(A, true));
    expect(result.current).toBe(true);
    act(() => useVoiceStore.getState().setSpeaking(A, false));
    expect(result.current).toBe(false);
  });

  it('only answers for its own pubkey', () => {
    useVoiceStore.getState().setSpeaking(B, true);
    expect(renderHook(() => useTileSpeaking(A)).result.current).toBe(false);
    expect(renderHook(() => useTileSpeaking(B)).result.current).toBe(true);
  });
});
