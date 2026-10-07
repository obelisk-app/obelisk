import { describe, expect, it } from 'vitest';
import { dmBubbleClass, dmPeersByLatest, markAt, splitByFollows, uniqueHits } from '@/utils/shell/mobile/dm-list';

describe('dmPeersByLatest', () => {
  it('keeps each conversation with a message, with its latest, newest conversation first', () => {
    const list = dmPeersByLatest({ a: [{ createdAt: 1 }, { createdAt: 9 }], b: [{ createdAt: 5 }], c: [] });
    expect(list).toEqual([{ peer: 'a', latest: { createdAt: 9 } }, { peer: 'b', latest: { createdAt: 5 } }]);
  });
});

describe('splitByFollows', () => {
  it('splits the conversations by whether you follow the peer', () => {
    expect(splitByFollows([{ peer: 'a' }, { peer: 'b' }], new Set(['b']))).toEqual({ follows: [{ peer: 'b' }], others: [{ peer: 'a' }] });
  });
});

describe('uniqueHits', () => {
  it('drops the missing hits and keeps the first of each pubkey', () => {
    expect(uniqueHits([null, { pubkey: 'a', n: 1 }, undefined, { pubkey: 'a', n: 2 }, { pubkey: 'b', n: 3 }]))
      .toEqual([{ pubkey: 'a', n: 1 }, { pubkey: 'b', n: 3 }]);
  });
});

describe('dmBubbleClass', () => {
  it('names the direction then the send state', () => {
    expect(dmBubbleClass({ outgoing: false })).toBe('dm-bubble incoming');
    expect(dmBubbleClass({ outgoing: true, pending: true })).toBe('dm-bubble outgoing delivered pending');
    expect(dmBubbleClass({ outgoing: true, failed: true })).toBe('dm-bubble outgoing delivered failed');
  });
});

describe('markAt', () => {
  it('reads the mark at a message index, none for dividers or past the end', () => {
    expect(markAt(['x', null], { type: 'msg', index: 0 })).toBe('x');
    expect(markAt(['x'], { type: 'msg', index: 3 })).toBeNull();
    expect(markAt(['x'], { type: 'divider' })).toBeNull();
  });
});
