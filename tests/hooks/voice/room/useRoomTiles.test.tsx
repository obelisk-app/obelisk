import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useMuteForMeButton } from '@/hooks/voice/room/useMuteForMeButton';
import { useFullscreenButton } from '@/hooks/voice/room/useFullscreenButton';
import { useParticipantProfile } from '@/hooks/voice/room/useParticipantProfile';
import { useParticipantTile } from '@/hooks/voice/room/useParticipantTile';
import { usePassiveCallRoster } from '@/hooks/voice/room/usePassiveCallRoster';
import { useQualityDot } from '@/hooks/voice/room/useQualityDot';
import { useVideoTile } from '@/hooks/voice/room/useVideoTile';
import { useVoiceStore } from '@/store/voice';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { userMetadataFixture } from '@tests/support/mocks/nostr-bridge';

const A = 'a'.repeat(64);
const click = () => ({ stopPropagation: vi.fn() }) as unknown as MouseEvent;
const wrapper = () => bridgeWrapper(fakeBridge({ userMetadata: { [A]: userMetadataFixture({ pubkey: A, displayName: 'Ada', picture: 'https://img.test/a.png' }) } }));

afterEach(() => { useVoiceStore.setState({ localMutedPubkeys: {}, speakingPubkeys: {}, peerQuality: {} }); });

describe('useMuteForMeButton', () => {
  it('toggles the local mute and keeps the click from the tile', () => {
    const { result } = renderHook(() => useMuteForMeButton(A));
    const e = click();
    act(() => { result.current.toggle(e); });
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(result.current.muted).toBe(true);
    act(() => { result.current.toggle(click()); });
    expect(result.current.muted).toBe(false);
  });
});

describe('useFullscreenButton', () => {
  it('requests fullscreen on the target and keeps the click from the tile', () => {
    const el = document.createElement('div');
    const requestFullscreen = vi.fn(async () => {});
    Object.assign(el, { requestFullscreen });
    const ref = { current: el };
    const { result } = renderHook(() => useFullscreenButton(ref));
    expect(result.current.isFullscreen).toBe(false);
    const e = click();
    act(() => { result.current.toggle(e); });
    expect(e.stopPropagation).toHaveBeenCalled();
    expect(requestFullscreen).toHaveBeenCalled();
  });
});

describe('participant hooks', () => {
  it('name the participant from the profile, or a short key', () => {
    const { result } = renderHook(() => useParticipantProfile(A), { wrapper: wrapper() });
    expect(result.current).toEqual({ picture: 'https://img.test/a.png', name: 'Ada' });
    const other = renderHook(() => useParticipantProfile('b'.repeat(64)), { wrapper: wrapper() });
    expect(other.result.current.name).toBe('bbbbbbbb');
  });

  it('add whether the participant is speaking', () => {
    const { result } = renderHook(() => useParticipantTile(A), { wrapper: wrapper() });
    expect(result.current.speaking).toBe(false);
  });
});

describe('usePassiveCallRoster', () => {
  it('shows six faces and counts the rest, and nothing for an empty call', () => {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8'];
    expect(renderHook(() => usePassiveCallRoster(keys, 10)).result.current).toMatchObject({ empty: false, hidden: 4 });
    expect(renderHook(() => usePassiveCallRoster(keys, 10)).result.current.visible).toHaveLength(6);
    expect(renderHook(() => usePassiveCallRoster([], 0)).result.current.empty).toBe(true);
    expect(renderHook(() => usePassiveCallRoster([], 3)).result.current).toMatchObject({ empty: false, hidden: 3 });
  });
});

describe('useQualityDot', () => {
  it('says connecting before a sample and lists the measured numbers after', () => {
    const { result } = renderHook(() => useQualityDot(A), { wrapper: wrapper() });
    expect(result.current.level).toBe('unknown');
    expect(result.current.title).toContain('onnecting');
    act(() => { useVoiceStore.setState({ peerQuality: { [A]: { level: 'good', rttMs: 42.4, outboundVideoBps: 1_500_000, loss: 0.012 } } } as never); });
    expect(result.current.level).toBe('good');
    expect(result.current.title).toContain('42');
    expect(result.current.title).toContain('1500');
    expect(result.current.title).toContain('1.2');
  });
});

describe('useVideoTile', () => {
  it('pins on Enter and Space when pinnable, and ignores keys otherwise', () => {
    const onPin = vi.fn();
    const key = (k: string) => ({ key: k, preventDefault: vi.fn() }) as unknown as KeyboardEvent;
    const { result } = renderHook(() => useVideoTile(A, null, onPin), { wrapper: wrapper() });
    result.current.onKeyDown(key('Enter'));
    result.current.onKeyDown(key(' '));
    result.current.onKeyDown(key('a'));
    expect(onPin).toHaveBeenCalledTimes(2);
    const still = renderHook(() => useVideoTile(A, null), { wrapper: wrapper() });
    expect(() => still.result.current.onKeyDown(key('Enter'))).not.toThrow();
    expect(result.current.name).toBe('Ada');
  });
});
