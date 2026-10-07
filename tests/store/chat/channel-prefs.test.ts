import { beforeEach, describe, expect, it } from 'vitest';
import {
  CHANNEL_PREFS_STORE_VERSION,
  ensureChannelPrefsStoreForAccount,
  getChannelPref,
  isChannelMuted,
  notifyLevel,
  useChannelPrefsStore,
} from '@/store/chat/channel-prefs';
import { MUTED_FOREVER } from '@/constants/chat/channel-prefs';
import { CORRUPT_STATES, freshPubkey, readBlob, seedBlob } from '../persist-blob';

const R = 'wss://r.example';

describe('channel prefs', () => {
  beforeEach(() => useChannelPrefsStore.getState().reset());

  it('defaults: followed, not muted, mentions only', () => {
    const p = getChannelPref(R, 'c');
    expect(p.unfollowed).toBeUndefined();
    expect(isChannelMuted(p)).toBe(false);
    expect(notifyLevel(p)).toBe('mentions');
  });

  it('is keyed per relay: the same group id on another relay is independent', () => {
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

describe('channel prefs saved-data migrations', () => {
  const key = (pk: string) => `obelisk-channel-prefs:${pk}`;
  const prefs = () => useChannelPrefsStore.getState().prefs;

  it('a version 0 blob keeps every pref, including mute-forever, and is saved back under the current version', () => {
    const pk = freshPubkey();
    const saved = {
      prefs: {
        [`${R}|a`]: { unfollowed: true },
        [`${R}|b`]: { mutedUntil: MUTED_FOREVER, notify: 'nothing' },
        [`${R}|c`]: { mutedUntil: 1_700_000_000_000, notify: 'all' },
      },
    };
    seedBlob(key(pk), saved, 0);
    ensureChannelPrefsStoreForAccount(pk);
    expect(prefs()).toEqual(saved.prefs);
    expect(readBlob(key(pk))).toEqual({ state: saved, version: CHANNEL_PREFS_STORE_VERSION });
  });

  it('drops fields of the wrong type, and a pref left empty', () => {
    const pk = freshPubkey();
    seedBlob(key(pk), {
      prefs: {
        [`${R}|a`]: { unfollowed: 'yes', notify: 'loud', mutedUntil: 5 },
        [`${R}|b`]: { unfollowed: false, notify: 'mentions' },
        [`${R}|c`]: 'muted',
      },
    }, 0);
    ensureChannelPrefsStoreForAccount(pk);
    expect(prefs()).toEqual({ [`${R}|a`]: { mutedUntil: 5 } });
  });

  it.each(CORRUPT_STATES)('falls back to the defaults on %s', (_label, state, version) => {
    const pk = freshPubkey();
    seedBlob(key(pk), state, version);
    expect(() => ensureChannelPrefsStoreForAccount(pk)).not.toThrow();
    expect(prefs()).toEqual({});
  });
});
