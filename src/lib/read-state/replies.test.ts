import { describe, it, expect } from 'vitest';
import type { JsMessage } from '@/lib/nostr-bridge/types';
import { buildAuthorIndex, isReplyToMe } from './replies';

const me = 'a'.repeat(64);
const someone = 'b'.repeat(64);
const otherUser = 'c'.repeat(64);

function msg(id: string, pubkey: string, replyToId: string | null = null): JsMessage {
  return { id, pubkey, content: '', createdAt: 0, kind: 9, replyToId };
}

describe('buildAuthorIndex', () => {
  it('maps each id to its author', () => {
    const idx = buildAuthorIndex([
      msg('m1', me),
      msg('m2', someone),
    ]);
    expect(idx.get('m1')).toBe(me);
    expect(idx.get('m2')).toBe(someone);
    expect(idx.get('absent')).toBeUndefined();
  });
});

describe('isReplyToMe', () => {
  const messages = [
    msg('mine-1', me),
    msg('mine-2', me),
    msg('theirs-1', someone),
  ];
  const idx = buildAuthorIndex(messages);

  it('returns true when reply targets one of my messages', () => {
    expect(isReplyToMe(msg('reply-1', someone, 'mine-1'), idx, me)).toBe(true);
  });

  it('returns false for a plain message (no replyToId)', () => {
    expect(isReplyToMe(msg('plain', someone, null), idx, me)).toBe(false);
  });

  it('returns false when the reply targets another user', () => {
    expect(isReplyToMe(msg('reply-2', someone, 'theirs-1'), idx, me)).toBe(false);
  });

  it('returns false when myPubkey is null', () => {
    expect(isReplyToMe(msg('reply', someone, 'mine-1'), idx, null)).toBe(false);
  });

  it('returns false when the parent is not in the local message list', () => {
    // Backfill not yet fetched, message is not anchored to a local parent.
    expect(isReplyToMe(msg('reply', someone, 'unseen-id'), idx, me)).toBe(false);
  });

  it('returns true for self-reply (I replied to my own message)', () => {
    // Edge case — a self-reply still counts; the consuming UI filters
    // own-author messages out of unread counts before this is called.
    expect(isReplyToMe(msg('reply', me, 'mine-1'), idx, me)).toBe(true);
  });

  it('handles a long thread where the parent was authored by me earlier', () => {
    const longIdx = buildAuthorIndex([
      msg('m0', otherUser),
      msg('m1', me),
      msg('m2', someone),
      msg('m3', otherUser),
    ]);
    expect(isReplyToMe(msg('r', someone, 'm1'), longIdx, me)).toBe(true);
    expect(isReplyToMe(msg('r', someone, 'm0'), longIdx, me)).toBe(false);
  });
});
