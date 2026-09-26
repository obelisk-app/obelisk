import { beforeEach, describe, expect, it } from 'vitest';
import {
  MUTED_FOREVER,
  getChannelPref,
  isChannelMuted,
  notifyLevel,
  useChannelPrefsStore,
} from './channel-prefs';

const R = 'wss://r.example';

describe('channel prefs', () => {
  beforeEach(() => useChannelPrefsStore.getState().reset());

  it('defaults: followed, not muted, mentions only', () => {
    const p = getChannelPref(R, 'c');
    expect(p.unfollowed).toBeUndefined();
    expect(isChannelMuted(p)).toBe(false);
    expect(notifyLevel(p)).toBe('mentions');
  });

  it('is keyed per relay — the same group id on another relay is independent', () => {
    useChannelPrefsStore.getState().setFollowing(R, 'c', false);
    expect(getChannelPref(R, 'c').unfollowed).toBe(true);
    expect(getChannelPref('wss://other.example', 'c').unfollowed).toBeUndefined();
  });

  it('timed mute expires; forever does not', () => {
    const s = useChannelPrefsStore.getState();
    s.setMutedUntil(R, 'a', 10_000);
    s.setMutedUntil(R, 'b', MUTED_FOREVER);
    expect(isChannelMuted(getChannelPref(R, 'a'), 9_999)).toBe(true);
    expect(isChannelMuted(getChannelPref(R, 'a'), 10_001)).toBe(false);
    expect(isChannelMuted(getChannelPref(R, 'b'), Number.MAX_SAFE_INTEGER)).toBe(true);
    s.setMutedUntil(R, 'b', null);
    expect(isChannelMuted(getChannelPref(R, 'b'))).toBe(false);
  });

  it('back to defaults removes the entry entirely', () => {
    const s = useChannelPrefsStore.getState();
    s.setNotify(R, 'c', 'all');
    s.setFollowing(R, 'c', false);
    s.setNotify(R, 'c', 'mentions');
    s.setFollowing(R, 'c', true);
    expect(useChannelPrefsStore.getState().prefs).toEqual({});
  });
});
