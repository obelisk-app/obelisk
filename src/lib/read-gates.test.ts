import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import {
  isUserWatchingChannel,
  isUserWatchingDM,
  handleIncomingChannelMessage,
  handleIncomingDM,
} from './read-gates';
import { useChatStore } from '@/store/chat';
import { useDMStore } from '@/store/dm';
import { useNotificationStore } from '@/store/notification';

function setVisible(value: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (value ? 'visible' : 'hidden'),
  });
}

describe('isUserWatchingChannel', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeChannelId: 'ch1',
      isNearBottom: true,
    } as any);
    setVisible(true);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when all gates pass', () => {
    expect(isUserWatchingChannel('ch1')).toBe(true);
  });

  it('returns false when tab is hidden', () => {
    setVisible(false);
    expect(isUserWatchingChannel('ch1')).toBe(false);
  });

  it('returns false when window is blurred', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    expect(isUserWatchingChannel('ch1')).toBe(false);
  });

  it('returns false when target channel is not the active channel', () => {
    expect(isUserWatchingChannel('ch-other')).toBe(false);
  });

  it('returns false when scrolled up', () => {
    useChatStore.setState({ isNearBottom: false } as any);
    expect(isUserWatchingChannel('ch1')).toBe(false);
  });

  it('returns false when there is no active channel', () => {
    useChatStore.setState({ activeChannelId: null } as any);
    expect(isUserWatchingChannel('ch1')).toBe(false);
  });
});

describe('isUserWatchingDM', () => {
  const other = 'aa'.repeat(32);

  beforeEach(() => {
    useDMStore.setState({ activeDMPubkey: other } as any);
    setVisible(true);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when visible + focused + thread active', () => {
    expect(isUserWatchingDM(other)).toBe(true);
  });

  it('returns false when tab hidden', () => {
    setVisible(false);
    expect(isUserWatchingDM(other)).toBe(false);
  });

  it('returns false when window blurred', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    expect(isUserWatchingDM(other)).toBe(false);
  });

  it('returns false when target thread is not active', () => {
    expect(isUserWatchingDM('bb'.repeat(32))).toBe(false);
  });
});

describe('handleIncomingChannelMessage', () => {
  const self = '11'.repeat(32);
  const other = '22'.repeat(32);

  beforeEach(() => {
    useNotificationStore.setState(useNotificationStore.getInitialState());
    useChatStore.setState({
      activeChannelId: 'ch1',
      isNearBottom: true,
    } as any);
    setVisible(true);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when ownPubkey is null', () => {
    const res = handleIncomingChannelMessage(
      { channelId: 'ch1', authorPubkey: other, content: 'hi' },
      null,
    );
    expect(res.incremented).toBe(false);
    expect(useNotificationStore.getState().channelUnreads['ch1']).toBeUndefined();
  });

  it('skips own messages', () => {
    setVisible(false);
    const res = handleIncomingChannelMessage(
      { channelId: 'ch1', authorPubkey: self, content: 'hi' },
      self,
    );
    expect(res.incremented).toBe(false);
  });

  it('skips when user is actively watching the channel', () => {
    const res = handleIncomingChannelMessage(
      { channelId: 'ch1', authorPubkey: other, content: 'hi' },
      self,
    );
    expect(res.incremented).toBe(false);
    expect(useNotificationStore.getState().channelUnreads['ch1']).toBeUndefined();
  });

  it('increments when tab is hidden (scenario 1)', () => {
    setVisible(false);
    const res = handleIncomingChannelMessage(
      { channelId: 'ch1', authorPubkey: other, content: 'hi' },
      self,
    );
    expect(res.incremented).toBe(true);
    expect(res.hasMention).toBe(false);
    expect(useNotificationStore.getState().channelUnreads['ch1']).toBe(1);
    expect(useNotificationStore.getState().channelMentions['ch1']).toBeUndefined();
  });

  it('increments when window is blurred', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const res = handleIncomingChannelMessage(
      { channelId: 'ch1', authorPubkey: other, content: 'hi' },
      self,
    );
    expect(res.incremented).toBe(true);
    expect(useNotificationStore.getState().channelUnreads['ch1']).toBe(1);
  });

  it('increments when scrolled up (scenario 2)', () => {
    useChatStore.setState({ isNearBottom: false } as any);
    const res = handleIncomingChannelMessage(
      { channelId: 'ch1', authorPubkey: other, content: 'hi' },
      self,
    );
    expect(res.incremented).toBe(true);
    expect(useNotificationStore.getState().channelUnreads['ch1']).toBe(1);
  });

  it('increments for a message in a non-active channel', () => {
    const res = handleIncomingChannelMessage(
      { channelId: 'ch-other', authorPubkey: other, content: 'hi' },
      self,
    );
    expect(res.incremented).toBe(true);
    expect(useNotificationStore.getState().channelUnreads['ch-other']).toBe(1);
  });

  it('sets mention flag when content contains self npub', () => {
    setVisible(false);
    const npub = nip19.npubEncode(self);
    const res = handleIncomingChannelMessage(
      { channelId: 'ch1', authorPubkey: other, content: `hey nostr:${npub} check this` },
      self,
    );
    expect(res.incremented).toBe(true);
    expect(res.hasMention).toBe(true);
    expect(useNotificationStore.getState().channelMentions['ch1']).toBe(true);
  });

  it('accumulates multiple increments', () => {
    setVisible(false);
    handleIncomingChannelMessage({ channelId: 'ch1', authorPubkey: other, content: 'a' }, self);
    handleIncomingChannelMessage({ channelId: 'ch1', authorPubkey: other, content: 'b' }, self);
    handleIncomingChannelMessage({ channelId: 'ch1', authorPubkey: other, content: 'c' }, self);
    expect(useNotificationStore.getState().channelUnreads['ch1']).toBe(3);
  });
});

describe('handleIncomingDM', () => {
  const other = '33'.repeat(32);

  beforeEach(() => {
    useNotificationStore.setState(useNotificationStore.getInitialState());
    useDMStore.setState({ activeDMPubkey: null } as any);
    setVisible(true);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips own messages', () => {
    const res = handleIncomingDM(other, true, 0);
    expect(res).toEqual({ nextUnread: 0, badged: false });
    expect(useNotificationStore.getState().dmUnreads[other]).toBeUndefined();
  });

  it('skips when thread is actively watched', () => {
    useDMStore.setState({ activeDMPubkey: other } as any);
    const res = handleIncomingDM(other, false, 0);
    expect(res).toEqual({ nextUnread: 0, badged: false });
    expect(useNotificationStore.getState().dmUnreads[other]).toBeUndefined();
  });

  it('increments and bridges to notification store when tab hidden (scenario 10)', () => {
    setVisible(false);
    const res = handleIncomingDM(other, false, 0);
    expect(res).toEqual({ nextUnread: 1, badged: true });
    expect(useNotificationStore.getState().dmUnreads[other]).toBe(1);
  });

  it('increments for a non-watched thread with existing unread', () => {
    useDMStore.setState({ activeDMPubkey: 'other-thread' } as any);
    const res = handleIncomingDM(other, false, 4);
    expect(res).toEqual({ nextUnread: 5, badged: true });
    expect(useNotificationStore.getState().dmUnreads[other]).toBe(5);
  });
});
