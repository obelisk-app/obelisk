import { describe, it, expect, beforeEach } from 'vitest';
import { useNotificationStore } from './notification';

describe('useNotificationStore', () => {
  beforeEach(() => {
    useNotificationStore.setState(useNotificationStore.getInitialState());
  });

  it('starts with empty state', () => {
    const state = useNotificationStore.getState();
    expect(state.channelUnreads).toEqual({});
    expect(state.channelMentions).toEqual({});
    expect(state.dmUnreads).toEqual({});
    expect(state.permissionGranted).toBe(false);
  });

  it('setChannelUnread sets count and mention flag', () => {
    useNotificationStore.getState().setChannelUnread('ch1', 5, true);
    const state = useNotificationStore.getState();
    expect(state.channelUnreads['ch1']).toBe(5);
    expect(state.channelMentions['ch1']).toBe(true);
  });

  it('incrementChannelUnread increments from 0', () => {
    useNotificationStore.getState().incrementChannelUnread('ch1');
    expect(useNotificationStore.getState().channelUnreads['ch1']).toBe(1);
  });

  it('incrementChannelUnread increments existing count', () => {
    useNotificationStore.getState().setChannelUnread('ch1', 3);
    useNotificationStore.getState().incrementChannelUnread('ch1');
    expect(useNotificationStore.getState().channelUnreads['ch1']).toBe(4);
  });

  it('incrementChannelUnread sets mention flag', () => {
    useNotificationStore.getState().incrementChannelUnread('ch1', true);
    expect(useNotificationStore.getState().channelMentions['ch1']).toBe(true);
  });

  it('clearChannelUnread removes channel from both maps', () => {
    useNotificationStore.getState().setChannelUnread('ch1', 5, true);
    useNotificationStore.getState().clearChannelUnread('ch1');
    const state = useNotificationStore.getState();
    expect(state.channelUnreads['ch1']).toBeUndefined();
    expect(state.channelMentions['ch1']).toBeUndefined();
  });

  it('setDMUnread and clearDMUnread', () => {
    useNotificationStore.getState().setDMUnread('pk1', 3);
    expect(useNotificationStore.getState().dmUnreads['pk1']).toBe(3);

    useNotificationStore.getState().clearDMUnread('pk1');
    expect(useNotificationStore.getState().dmUnreads['pk1']).toBeUndefined();
  });

  it('setBulkUnreads replaces all state', () => {
    useNotificationStore.getState().setChannelUnread('old', 1);
    useNotificationStore.getState().setBulkUnreads({
      channels: { ch1: 2, ch2: 5 },
      dms: { pk1: 1 },
      mentionChannels: { ch2: true },
    });

    const state = useNotificationStore.getState();
    expect(state.channelUnreads).toEqual({ ch1: 2, ch2: 5 });
    expect(state.dmUnreads).toEqual({ pk1: 1 });
    expect(state.channelMentions).toEqual({ ch2: true });
    // old channel should be gone
    expect(state.channelUnreads['old']).toBeUndefined();
  });

  it('setChannelServerMap updates mapping', () => {
    useNotificationStore.getState().setChannelServerMap({ ch1: 's1', ch2: 's1' });
    expect(useNotificationStore.getState().channelServerMap).toEqual({ ch1: 's1', ch2: 's1' });
  });

  it('setPermission updates permission state', () => {
    useNotificationStore.getState().setPermission(true);
    expect(useNotificationStore.getState().permissionGranted).toBe(true);
  });
});
