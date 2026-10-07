import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModerationStore } from '@/store/moderation';
import { useDmThreadMenu } from '@/hooks/chat/dm/thread/useDmThreadMenu';

const PEER = 'a'.repeat(64);

describe('useDmThreadMenu', () => {
  beforeEach(() => {
    useModerationStore.setState({ mutedPubkeys: [], blockedPubkeys: [] });
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('openProfile closes the menu and hands the peer over', () => {
    const onOpenProfile = vi.fn();
    const { result } = renderHook(() => useDmThreadMenu(PEER, onOpenProfile));
    act(() => result.current.toggle());
    act(() => result.current.openProfile());
    expect(onOpenProfile).toHaveBeenCalledWith(PEER);
    expect(result.current.open).toBe(false);
  });

  it('mute and block toggle the store for this peer and close the menu', () => {
    const { result } = renderHook(() => useDmThreadMenu(PEER));
    act(() => result.current.toggle());
    act(() => result.current.toggleMute());
    expect(result.current.muted).toBe(true);
    expect(result.current.open).toBe(false);
    act(() => result.current.toggleBlock());
    expect(result.current.blocked).toBe(true);
    expect(useModerationStore.getState().blockedPubkeys).toContain(PEER);
  });

  it('copyNpub writes the npub, not the hex key', async () => {
    const { result } = renderHook(() => useDmThreadMenu(PEER));
    await act(async () => result.current.copyNpub());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringMatching(/^npub1/));
    expect(result.current.copied).toBe(true);
  });
});
