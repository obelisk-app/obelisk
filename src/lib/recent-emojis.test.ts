import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetRecentEmojiSnapshotForTests,
  getRecentEmojisSnapshot,
  loadRecentEmojis,
  pushRecentEmoji,
  quickReactions,
  saveRecentEmojis,
  subscribeRecentEmojis,
} from './recent-emojis';

const KEY = 'obelisk:recent-emojis';

describe('recent-emojis', () => {
  beforeEach(() => localStorage.clear());

  it('remembers the media URL of custom picks', () => {
    pushRecentEmoji(':party_cat:', { url: 'https://cdn.example/party_cat.gif', packAddress: '30078:abc:pack' });

    expect(loadRecentEmojis()).toEqual([
      { char: ':party_cat:', url: 'https://cdn.example/party_cat.gif', packAddress: '30078:abc:pack' },
    ]);
  });

  it('reads legacy string-only entries', () => {
    localStorage.setItem(KEY, JSON.stringify(['😀', ':wave:', '', 42]));

    expect(loadRecentEmojis()).toEqual([{ char: '😀' }, { char: ':wave:' }]);
  });

  it('keeps unicode picks stored as plain strings', () => {
    pushRecentEmoji('😀');

    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['😀']);
  });

  it('moves a repeated pick to the front without duplicating it', () => {
    pushRecentEmoji('😀');
    pushRecentEmoji(':wave:', { url: 'https://cdn.example/wave.webp' });
    const next = pushRecentEmoji('😀');

    expect(next.map((entry) => entry.char)).toEqual(['😀', ':wave:']);
  });

  it('caps the list at 24 entries', () => {
    saveRecentEmojis(Array.from({ length: 40 }, (_, index) => ({ char: `e${index}` })));

    expect(loadRecentEmojis()).toHaveLength(24);
  });
});

describe('recent emojis → quick reactions', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetRecentEmojiSnapshotForTests();
  });

  it('pads with the defaults until the user has recents', () => {
    expect(quickReactions([], 3).map((e) => e.char)).toEqual(['🔥', '⚡', '😂']);
  });

  it('puts recents first, without duplicates', () => {
    const recent = [{ char: '🙏' }, { char: '⚡' }];
    expect(quickReactions(recent, 4).map((e) => e.char)).toEqual(['🙏', '⚡', '🔥', '😂']);
  });

  it('the shared snapshot updates and notifies on push', () => {
    const listener = vi.fn();
    const unsub = subscribeRecentEmojis(listener);
    pushRecentEmoji('🦀');
    expect(listener).toHaveBeenCalled();
    expect(getRecentEmojisSnapshot()[0].char).toBe('🦀');
    unsub();
  });

  it('keeps custom emoji media', () => {
    pushRecentEmoji(':party:', { url: 'https://x/p.gif' });
    expect(quickReactions(getRecentEmojisSnapshot(), 1)[0]).toMatchObject({ char: ':party:', url: 'https://x/p.gif' });
  });
});
