import { describe, it, expect } from 'vitest';
import type { JsDirectMessage, JsMessage } from '@/lib/nostr-bridge/types';
import {
  countDMUnread,
  countChannelUnread,
  channelHasMention,
  computeChannelHighlights,
} from './selectors';

const dm = (overrides: Partial<JsDirectMessage>): JsDirectMessage => ({
  id: 'id',
  counterparty: 'peer',
  outgoing: false,
  content: 'hi',
  createdAt: 0,
  ...overrides,
});

const msg = (overrides: Partial<JsMessage>): JsMessage => ({
  id: 'id',
  pubkey: 'pk',
  content: '',
  createdAt: 0,
  kind: 9,
  replyToId: null,
  mentions: [],
  ...overrides,
});

describe('countDMUnread', () => {
  it('returns 0 for an empty list', () => {
    expect(countDMUnread([], 0)).toBe(0);
  });

  it('counts incoming messages newer than the cursor', () => {
    const list = [
      dm({ id: 'a', createdAt: 100, outgoing: false }),
      dm({ id: 'b', createdAt: 200, outgoing: false }),
      dm({ id: 'c', createdAt: 300, outgoing: false }),
    ];
    // cursor 150_000 ms == 150 sec → only 200 and 300 are unread
    expect(countDMUnread(list, 150_000)).toBe(2);
  });

  it('skips outgoing messages', () => {
    const list = [
      dm({ id: 'a', createdAt: 100, outgoing: false }),
      dm({ id: 'b', createdAt: 200, outgoing: true }),  // own → skip
      dm({ id: 'c', createdAt: 300, outgoing: false }),
    ];
    expect(countDMUnread(list, 0)).toBe(2);
  });

  it('returns 0 when cursor >= every message', () => {
    const list = [
      dm({ id: 'a', createdAt: 100 }),
      dm({ id: 'b', createdAt: 200 }),
    ];
    expect(countDMUnread(list, 999_999_000)).toBe(0);
  });

  it('treats createdAt == cursor (in ms) as already read', () => {
    const list = [dm({ id: 'a', createdAt: 100, outgoing: false })];
    // 100 sec * 1000 = 100_000 ms; cursor at 100_000 → already read
    expect(countDMUnread(list, 100_000)).toBe(0);
  });
});

describe('countChannelUnread', () => {
  it('counts messages newer than cursor, excluding own', () => {
    const list = [
      msg({ id: 'a', createdAt: 100, pubkey: 'someone' }),
      msg({ id: 'b', createdAt: 200, pubkey: 'me' }),       // own → skip
      msg({ id: 'c', createdAt: 300, pubkey: 'someone' }),
    ];
    expect(countChannelUnread(list, 50_000, 'me')).toBe(2);
  });

  it('counts everything when ownPubkey is null', () => {
    const list = [
      msg({ id: 'a', createdAt: 100, pubkey: 'me' }),
      msg({ id: 'b', createdAt: 200, pubkey: 'someone' }),
    ];
    expect(countChannelUnread(list, 0, null)).toBe(2);
  });

  it('returns 0 for empty list', () => {
    expect(countChannelUnread([], 0, 'me')).toBe(0);
  });
});

describe('channelHasMention', () => {
  // Reads the precomputed `mentions` field that bridge ingest stamps from
  // `extractMentionPubkeysFromMessage(content, tags)`. Tests provide it
  // directly here to stay independent of the bridge.
  const ME = 'a'.repeat(64);

  it('returns false when ownPubkey is null', () => {
    const list = [msg({ mentions: [ME], createdAt: 100 })];
    expect(channelHasMention(list, 0, null)).toBe(false);
  });

  it('finds a mention in an unread message', () => {
    const list = [
      msg({ id: 'a', createdAt: 100, pubkey: 'someone', mentions: [] }),
      msg({ id: 'b', createdAt: 200, pubkey: 'someone', mentions: [ME] }),
    ];
    expect(channelHasMention(list, 0, ME)).toBe(true);
  });

  it('ignores mentions older than the cursor', () => {
    const list = [
      msg({ id: 'a', createdAt: 100, pubkey: 'someone', mentions: [ME] }),
    ];
    expect(channelHasMention(list, 200_000, ME)).toBe(false);
  });

  it('skips own messages even if they "mention" me', () => {
    const list = [
      msg({ id: 'a', createdAt: 100, pubkey: ME, mentions: [ME] }),
    ];
    expect(channelHasMention(list, 0, ME)).toBe(false);
  });
});

describe('computeChannelHighlights', () => {
  const ME = 'a'.repeat(64);
  const SOMEONE = 'b'.repeat(64);

  it('returns zeros for an empty list', () => {
    expect(computeChannelHighlights([], 0, ME)).toEqual({
      unread: 0,
      mentions: 0,
      replies: 0,
      eventIds: [],
    });
  });

  it('counts unread messages excluding own', () => {
    const list = [
      msg({ id: 'a', createdAt: 100, pubkey: SOMEONE }),
      msg({ id: 'b', createdAt: 200, pubkey: ME }),       // own → skip
      msg({ id: 'c', createdAt: 300, pubkey: SOMEONE }),
    ];
    const h = computeChannelHighlights(list, 0, ME);
    expect(h.unread).toBe(2);
    expect(h.mentions).toBe(0);
    expect(h.replies).toBe(0);
    expect(h.eventIds).toEqual([]);
  });

  it('counts mentions and includes them in eventIds (oldest first)', () => {
    const list = [
      msg({ id: 'm1', createdAt: 100, pubkey: SOMEONE, mentions: [ME] }),
      msg({ id: 'normal', createdAt: 150, pubkey: SOMEONE }),
      msg({ id: 'm2', createdAt: 200, pubkey: SOMEONE, mentions: [ME] }),
    ];
    const h = computeChannelHighlights(list, 0, ME);
    expect(h.unread).toBe(3);
    expect(h.mentions).toBe(2);
    expect(h.replies).toBe(0);
    expect(h.eventIds).toEqual(['m1', 'm2']);
  });

  it('counts replies-to-me only when parent author matches', () => {
    const list = [
      msg({ id: 'mine', createdAt: 50, pubkey: ME }),
      msg({ id: 'theirs', createdAt: 100, pubkey: SOMEONE }),
      msg({ id: 'r1', createdAt: 200, pubkey: SOMEONE, replyToId: 'mine' }),
      msg({ id: 'r2', createdAt: 300, pubkey: SOMEONE, replyToId: 'theirs' }),
    ];
    const h = computeChannelHighlights(list, 99_000, ME);
    // 'mine' is own (skip); 'theirs' just predates the cursor or counts as
    // unread depending on cursor; cursor 99_000 ms == 99 s, so 'theirs' (100) is unread.
    // r1 is reply-to-me, r2 is reply-to-someone.
    expect(h.replies).toBe(1);
    expect(h.eventIds).toEqual(['r1']);
  });

  it('mention + reply on same message counts both flags but appears once in eventIds', () => {
    const list = [
      msg({ id: 'mine', createdAt: 50, pubkey: ME }),
      msg({ id: 'r', createdAt: 200, pubkey: SOMEONE, replyToId: 'mine', mentions: [ME] }),
    ];
    const h = computeChannelHighlights(list, 0, ME);
    expect(h.mentions).toBe(1);
    expect(h.replies).toBe(1);
    expect(h.eventIds).toEqual(['r']);
  });

  it('messages older than cursor do not contribute', () => {
    const list = [
      msg({ id: 'old', createdAt: 100, pubkey: SOMEONE, mentions: [ME] }),
      msg({ id: 'new', createdAt: 300, pubkey: SOMEONE, mentions: [ME] }),
    ];
    const h = computeChannelHighlights(list, 200_000, ME);
    expect(h.eventIds).toEqual(['new']);
    expect(h.mentions).toBe(1);
  });

  it('returns zero highlights when ownPubkey is null but still counts unread', () => {
    const list = [
      msg({ id: 'a', createdAt: 100, pubkey: SOMEONE, mentions: ['x'] }),
    ];
    const h = computeChannelHighlights(list, 0, null);
    expect(h.unread).toBe(1);
    expect(h.mentions).toBe(0);
    expect(h.replies).toBe(0);
  });
});
