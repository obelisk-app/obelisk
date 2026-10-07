import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChannelActions } from '@/hooks/chat/channel/useChannelActions';
import { getChannelPref, useChannelPrefsStore } from '@/store/chat/channel-prefs';
import { MUTED_FOREVER } from '@/constants/chat/channel-prefs';
import { NOTIFICATIONS_INITIAL, getUnreadMentionCount, useNotificationsStore } from '@/store/notifications';
import { READ_STATE_INITIAL, useReadStateStore } from '@/store/read-state';
import { channelLink } from '@/utils/chat/channel/channel-link';

const R = 'wss://lacrypta-relay.obelisk.ar';
const target = { relay: R, channelId: 'de8bb87545bea285' };

describe('useChannelActions', () => {
  beforeEach(() => {
    useChannelPrefsStore.getState().reset();
    useNotificationsStore.setState({ ...NOTIFICATIONS_INITIAL });
    useReadStateStore.setState({ ...READ_STATE_INITIAL });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads the defaults: following, not muted, mentions only, nothing copied', () => {
    const { result } = renderHook(() => useChannelActions(target));
    expect(result.current.following).toBe(true);
    expect(result.current.muted).toBe(false);
    expect(result.current.level).toBe('mentions');
    expect(result.current.copied).toBe(false);
  });

  it('markRead advances the channel cursor and clears the channel mention cards', () => {
    useNotificationsStore.getState().pushMention({ id: 'x'.repeat(64), relay: R, channelId: target.channelId, senderPubkey: 'p', preview: '', createdAt: 5_000 });
    expect(getUnreadMentionCount(R)).toBe(1);
    const { result } = renderHook(() => useChannelActions(target));
    act(() => result.current.markRead());
    expect(getUnreadMentionCount(R)).toBe(0);
    expect(useReadStateStore.getState().groupCursors[target.channelId]).toBeGreaterThan(5_000);
  });

  it('toggleFollow flips the pref both ways and the hook re-reads it', () => {
    const { result } = renderHook(() => useChannelActions(target));
    act(() => result.current.toggleFollow());
    expect(getChannelPref(R, target.channelId).unfollowed).toBe(true);
    expect(result.current.following).toBe(false);
    act(() => result.current.toggleFollow());
    expect(result.current.following).toBe(true);
  });

  it('mute(ms) arms a deadline from now, mute(MUTED_FOREVER) is the sentinel, unmute clears it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
    try {
      const { result } = renderHook(() => useChannelActions(target));
      act(() => result.current.mute(60 * 60_000));
      expect(getChannelPref(R, target.channelId).mutedUntil).toBe(Date.now() + 60 * 60_000);
      expect(result.current.muted).toBe(true);
      act(() => result.current.mute(MUTED_FOREVER));
      expect(getChannelPref(R, target.channelId).mutedUntil).toBe(MUTED_FOREVER);
      act(() => result.current.unmute());
      expect(result.current.muted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('setLevel changes the notification level', () => {
    const { result } = renderHook(() => useChannelActions(target));
    act(() => result.current.setLevel('all'));
    expect(result.current.level).toBe('all');
    act(() => result.current.setLevel('nothing'));
    expect(result.current.level).toBe('nothing');
  });

  it('copyLink writes the deep link and sets copied; a blocked clipboard leaves it false', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', Object.assign(navigator, { clipboard: { writeText } }));
    const { result } = renderHook(() => useChannelActions(target));
    await act(async () => { await result.current.copyLink(); });
    expect(writeText).toHaveBeenCalledWith(channelLink(R, target.channelId));
    expect(result.current.copied).toBe(true);

    vi.stubGlobal('navigator', Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } }));
    const blocked = renderHook(() => useChannelActions(target));
    await act(async () => { await blocked.result.current.copyLink(); });
    expect(blocked.result.current.copied).toBe(false);
  });

  it('copied clears itself after the shared hook\'s 2000 ms', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('navigator', Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } }));
      const { result } = renderHook(() => useChannelActions(target));
      await act(async () => { await result.current.copyLink(); });
      expect(result.current.copied).toBe(true);
      act(() => { vi.advanceTimersByTime(1999); });
      expect(result.current.copied).toBe(true);
      act(() => { vi.advanceTimersByTime(1); });
      expect(result.current.copied).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
