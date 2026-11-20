import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RECENT_CHANNEL_WINDOW_SECONDS } from '@/constants/chat/channel-prefs';
import { useRecentChannels } from '@/hooks/chat/channel/useRecentChannels';
import type { JsGroup } from '@/services/nostr-bridge';
import { useChannelPrefsStore } from '@/store/chat/channel-prefs';

const RELAY = 'wss://recent.test';

afterEach(() => {
  useChannelPrefsStore.getState().reset();
  vi.useRealTimers();
});

it('ranks five followed channels, expires a quiet one and restores it on new activity', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  const now = Date.now() / 1000;
  const groups = Array.from({ length: 9 }, (_, i) => ({ id: String(i) }) as JsGroup);
  const prefs = useChannelPrefsStore.getState();
  for (let i = 0; i < 6; i++) {
    prefs.recordActivity(RELAY, String(i), now - RECENT_CHANNEL_WINDOW_SECONDS + 1 + i, true);
  }
  prefs.recordActivity(RELAY, '6', now, false);
  prefs.setFollowing(RELAY, '7', false);
  prefs.recordActivity(RELAY, '7', now, true);
  prefs.recordActivity(RELAY, '8', now, true);
  const { result } = renderHook(() => useRecentChannels(RELAY, groups, { parent: groups.slice(0, 7).map(({ id }) => id) }));
  expect([...result.current]).toEqual(['5', '4', '3', '2', '1']);

  act(() => vi.advanceTimersByTime(2000));
  expect([...result.current]).toEqual(['5', '4', '3', '2']);
  act(() => prefs.recordActivity(RELAY, '1', now + 2, false));
  expect([...result.current]).toEqual(['1', '5', '4', '3', '2']);
});

it('shows the latest older follows when there are no recent messages', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  const now = Date.now() / 1000;
  const groups = [{ id: 'older' }, { id: 'newer' }] as JsGroup[];
  const prefs = useChannelPrefsStore.getState();
  prefs.recordActivity(RELAY, 'older', now - RECENT_CHANNEL_WINDOW_SECONDS - 20, true);
  prefs.recordActivity(RELAY, 'newer', now - RECENT_CHANNEL_WINDOW_SECONDS - 10, true);
  const { result } = renderHook(() => useRecentChannels(RELAY, groups, { parent: ['older', 'newer'] }));
  expect([...result.current]).toEqual(['newer', 'older']);
});
