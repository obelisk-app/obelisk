import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetRemoteMediaForTest,
  getRemoteMediaSettings,
  mayAutoLoadRemoteMedia,
  normalizeRemoteMediaSettings,
  setRemoteMediaMode,
  subscribeRemoteMedia,
} from '@/services/media/remote-media';
import { REMOTE_MEDIA_DEFAULTS } from '@/constants/media/remote-media';

const alice = 'a'.repeat(64);
const bob = 'b'.repeat(64);

beforeEach(() => {
  window.localStorage.clear();
  _resetRemoteMediaForTest();
});

describe('remote media defaults', () => {
  it('are the safe ones: contacts-only in channels, ask in DMs', () => {
    expect(REMOTE_MEDIA_DEFAULTS).toEqual({ channel: 'contacts', dm: 'ask' });
    expect(getRemoteMediaSettings()).toEqual(REMOTE_MEDIA_DEFAULTS);
  });

  it('normalises anything unrecognised back to the default for that surface', () => {
    expect(normalizeRemoteMediaSettings(null)).toEqual(REMOTE_MEDIA_DEFAULTS);
    expect(normalizeRemoteMediaSettings({ channel: 'everything', dm: 42 })).toEqual(REMOTE_MEDIA_DEFAULTS);
    expect(normalizeRemoteMediaSettings({ dm: 'always' })).toEqual({ channel: 'contacts', dm: 'always' });
  });

  it('persists a change, notifies listeners, and ignores a no-op', () => {
    const listener = vi.fn();
    const off = subscribeRemoteMedia(listener);
    setRemoteMediaMode('dm', 'contacts');
    expect(getRemoteMediaSettings().dm).toBe('contacts');
    expect(JSON.parse(window.localStorage.getItem('obelisk:remote-media') ?? '{}')).toMatchObject({ dm: 'contacts' });
    setRemoteMediaMode('dm', 'contacts');
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });
});

describe('mayAutoLoadRemoteMedia', () => {
  const noTrust = { follows: [] as string[] };

  it('always loads the reader\'s own media, whatever the mode', () => {
    expect(mayAutoLoadRemoteMedia('ask', { pubkey: alice, own: true }, noTrust)).toBe(true);
    expect(mayAutoLoadRemoteMedia('contacts', { pubkey: null, own: true }, noTrust)).toBe(true);
  });

  it('"always" loads from anyone, "ask" from no one', () => {
    expect(mayAutoLoadRemoteMedia('always', { pubkey: null, own: false }, noTrust)).toBe(true);
    expect(mayAutoLoadRemoteMedia('ask', { pubkey: alice, own: false }, { follows: [alice] })).toBe(false);
  });

  it('"contacts" loads from a follow or a WoT-admitted author and from nobody unknown', () => {
    expect(mayAutoLoadRemoteMedia('contacts', { pubkey: alice, own: false }, { follows: [alice] })).toBe(true);
    expect(mayAutoLoadRemoteMedia('contacts', { pubkey: alice, own: false }, { follows: new Set([alice]) })).toBe(true);
    expect(mayAutoLoadRemoteMedia('contacts', { pubkey: bob, own: false }, { follows: [alice], wotDistance: (pk) => (pk === bob ? 2 : null) })).toBe(true);
    expect(mayAutoLoadRemoteMedia('contacts', { pubkey: bob, own: false }, { follows: [alice], wotDistance: () => null })).toBe(false);
    // An author the caller cannot identify is a stranger.
    expect(mayAutoLoadRemoteMedia('contacts', { pubkey: null, own: false }, { follows: [alice] })).toBe(false);
  });
});

