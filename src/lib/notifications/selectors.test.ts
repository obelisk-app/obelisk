import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUnreadMentionCardsForChannel } from './selectors';
import { NOTIFICATIONS_INITIAL, useNotificationsStore } from '@/store/notifications';
import { READ_STATE_INITIAL, useReadStateStore } from '@/store/read-state';

const A = 'wss://a.example';
const push = (id: string, channelId: string, relay = A) =>
  useNotificationsStore.getState().pushMention({ id, relay, channelId, senderPubkey: 'p', preview: '', createdAt: 5_000 });

describe('useUnreadMentionCardsForChannel', () => {
  beforeEach(() => {
    useNotificationsStore.setState({ ...NOTIFICATIONS_INITIAL });
    useReadStateStore.setState({ ...READ_STATE_INITIAL });
  });

  it('counts unread cards for one channel on one relay — with no messages loaded', () => {
    push('1', 'general');
    push('2', 'general');
    push('3', 'random');
    push('4', 'general', 'wss://b.example');
    const { result } = renderHook(() => useUnreadMentionCardsForChannel(A, 'general'));
    expect(result.current).toBe(2);
  });

  it('drops a card once seen, not when the channel cursor passes it', () => {
    push('1', 'general');
    const { result } = renderHook(() => useUnreadMentionCardsForChannel(A, 'general'));
    act(() => { useReadStateStore.getState().setGroupCursor('general', 10_000); });
    expect(result.current).toBe(1);
    act(() => { useNotificationsStore.getState().markMentionSeen(A, '1'); });
    expect(result.current).toBe(0);
  });

  it('drops everything when the bell is marked read', () => {
    push('1', 'general');
    const { result } = renderHook(() => useUnreadMentionCardsForChannel(A, 'general'));
    act(() => { useNotificationsStore.getState().markMentionsRead(A); });
    expect(result.current).toBe(0);
  });
});
