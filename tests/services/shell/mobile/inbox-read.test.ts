import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNotificationsStore } from '@/store/notifications';
import { useReadStateStore } from '@/store/read-state';
import { markInboxStreamRead } from '@/services/shell/mobile/inbox-read';

const markMentionsRead = vi.fn();
const markAllAsRead = vi.fn();

afterEach(() => vi.clearAllMocks());

describe('markInboxStreamRead', () => {
  it('clears the relay mentions and the channels, not the DMs', () => {
    useNotificationsStore.setState({ markMentionsRead } as never);
    useReadStateStore.setState({ markAllAsRead } as never);
    markInboxStreamRead('mentions', { relay: 'wss://r', groupIds: ['g'], peers: ['p'] });
    expect(markMentionsRead).toHaveBeenCalledWith('wss://r');
    expect(markAllAsRead).toHaveBeenCalledWith([], ['g']);
  });

  it('skips the mention cursor with no relay', () => {
    useNotificationsStore.setState({ markMentionsRead } as never);
    useReadStateStore.setState({ markAllAsRead } as never);
    markInboxStreamRead('mentions', { relay: null, groupIds: [], peers: [] });
    expect(markMentionsRead).not.toHaveBeenCalled();
  });

  it('clears the DMs only', () => {
    useNotificationsStore.setState({ markMentionsRead } as never);
    useReadStateStore.setState({ markAllAsRead } as never);
    markInboxStreamRead('dms', { relay: 'wss://r', groupIds: ['g'], peers: ['p'] });
    expect(markMentionsRead).not.toHaveBeenCalled();
    expect(markAllAsRead).toHaveBeenCalledWith(['p'], []);
  });
});
