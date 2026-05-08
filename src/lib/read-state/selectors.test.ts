import { describe, it, expect } from 'vitest';
import type { JsDirectMessage, JsMessage } from '@/lib/nostr-bridge/types';
import {
  countDMUnread,
  countChannelUnread,
  channelHasMention,
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
  // Legacy hex mention form is `nostr:npub1<64 hex>`. The extractor matches
  // it directly without bech32 decoding. We use it here so the test stays
  // independent of the nip19 codec.
  const ME = 'a'.repeat(64);
  const npubMe = 'nostr:npub1' + ME;

  it('returns false when ownPubkey is null', () => {
    const list = [msg({ content: `hey ${npubMe}`, createdAt: 100 })];
    expect(channelHasMention(list, 0, null)).toBe(false);
  });

  it('finds a mention in an unread message', () => {
    const list = [
      msg({ id: 'a', createdAt: 100, pubkey: 'someone', content: 'no mention here' }),
      msg({ id: 'b', createdAt: 200, pubkey: 'someone', content: `cc ${npubMe}` }),
    ];
    expect(channelHasMention(list, 0, ME)).toBe(true);
  });

  it('ignores mentions older than the cursor', () => {
    const list = [
      msg({ id: 'a', createdAt: 100, pubkey: 'someone', content: `old mention ${npubMe}` }),
    ];
    expect(channelHasMention(list, 200_000, ME)).toBe(false);
  });

  it('skips own messages even if they "mention" me', () => {
    const list = [
      msg({ id: 'a', createdAt: 100, pubkey: ME, content: `self mention ${npubMe}` }),
    ];
    expect(channelHasMention(list, 0, ME)).toBe(false);
  });
});
