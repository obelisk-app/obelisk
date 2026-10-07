import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useBackgroundVoiceAudio } from '@/hooks/voice/audio/useBackgroundVoiceAudio';
import { useBackgroundAudioElement } from '@/hooks/voice/audio/useBackgroundAudioElement';
import { setActiveVoiceClient } from '@/services/voice/active-client';
import type { RemoteTrack, VoiceClient } from '@/services/voice/client';
import { useVoiceStore } from '@/store/voice';

afterEach(() => {
  setActiveVoiceClient(null);
  useVoiceStore.setState({ isDeafened: false, localMutedPubkeys: {} });
});

describe('useBackgroundVoiceAudio', () => {
  it('follows the active client and keeps only the audible tracks', () => {
    let emit: (t: RemoteTrack[]) => void = () => {};
    const client = { subscribeRemoteTracks: vi.fn((cb: (t: RemoteTrack[]) => void) => { emit = cb; return () => {}; }) };
    const { result } = renderHook(() => useBackgroundVoiceAudio());
    expect(result.current).toEqual([]);
    act(() => { setActiveVoiceClient(client as unknown as VoiceClient); });
    const tracks = (['audio', 'camera', 'screen-audio'] as const).map((kind) => ({ kind, trackId: kind }) as unknown as RemoteTrack);
    act(() => { emit(tracks); });
    expect(result.current.map((t) => t.kind)).toEqual(['audio', 'screen-audio']);
    act(() => { setActiveVoiceClient(null); });
    expect(result.current).toEqual([]);
  });
});

describe('useBackgroundAudioElement', () => {
  it('is muted while deafened or while this person is muted for me', () => {
    const stream = {} as MediaStream;
    const { result } = renderHook(() => useBackgroundAudioElement('a', stream));
    expect(result.current.isMutedForMe).toBe(false);
    act(() => { useVoiceStore.setState({ localMutedPubkeys: { a: true } }); });
    expect(result.current.isMutedForMe).toBe(true);
    act(() => { useVoiceStore.setState({ localMutedPubkeys: {}, isDeafened: true }); });
    expect(result.current.isMutedForMe).toBe(true);
  });
});
