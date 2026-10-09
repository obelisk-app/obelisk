import { describe, expect, it } from 'vitest';
import type { JsDirectMessage } from '@/services/nostr-bridge';
import { defaultDmListTab, dmPeers, dmPreview, splitByFollows, unreadBadgeLabel } from '@/utils/shell/desktop/dm-list';

const msg = (createdAt: number, content = 'hi', outgoing = false) => ({ id: `${createdAt}`, content, createdAt, outgoing }) as JsDirectMessage;

describe('dm list helpers', () => {
  it('orders conversations by their last message, newest first', () => {
    const peers = dmPeers({ a: [msg(1), msg(5)], b: [msg(9)], c: [], empty: [] }, { c: 0 });
    expect(peers.map((p) => p.pubkey)).toEqual(['b', 'a', 'c']);
    expect(peers[1].last?.createdAt).toBe(5);
    expect(peers[2]).toEqual({ pubkey: 'c', last: undefined, sortKey: 0 });
  });

  it('splits follows from the rest, keeping the order', () => {
    const peers = dmPeers({ a: [msg(1)], b: [msg(2)], c: [msg(3)] });
    const split = splitByFollows(peers, new Set(['a', 'c']));
    expect(split.follows.map((p) => p.pubkey)).toEqual(['c', 'a']);
    expect(split.others.map((p) => p.pubkey)).toEqual(['b']);
  });

  it('opens on Follows unless only Others has conversations', () => {
    expect(defaultDmListTab(1, 3)).toBe('follows');
    expect(defaultDmListTab(0, 0)).toBe('follows');
    expect(defaultDmListTab(0, 2)).toBe('others');
  });

  it('previews the last message on one line, prefixed when it was sent', () => {
    expect(dmPreview(undefined, 'You: ')).toBeNull();
    expect(dmPreview(msg(1, 'a\n\n  b'), 'You: ')).toBe('a b');
    expect(dmPreview(msg(1, 'x'.repeat(100), true), 'You: ')).toBe(`You: ${'x'.repeat(60)}`);
  });

  it('caps the unread badge at 99+', () => {
    expect(unreadBadgeLabel(7)).toBe('7');
    expect(unreadBadgeLabel(99)).toBe('99');
    expect(unreadBadgeLabel(100)).toBe('99+');
  });
});
