import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import {
  dedupeReposts,
  groupReposts,
  embeddedRepostEvent,
  isRepost,
  repostInnerKind,
  repostTarget,
} from './repost';

const ev = (over: Partial<NostrEvent>): NostrEvent => ({
  id: 'id',
  pubkey: 'pk',
  content: '',
  created_at: 1,
  tags: [],
  kind: 1,
  sig: '',
  ...over,
});

describe('isRepost', () => {
  it('recognises kind 6 and kind 16', () => {
    expect(isRepost({ kind: 6 })).toBe(true);
    expect(isRepost({ kind: 16 })).toBe(true);
    expect(isRepost({ kind: 1 })).toBe(false);
  });
});

describe('repostTarget', () => {
  it('reads the e tag with its relay hint and the p author', () => {
    const target = repostTarget({
      tags: [['e', 'target-id', 'wss://hint'], ['p', 'orig-author']],
    });
    expect(target).toEqual({ id: 'target-id', relayHint: 'wss://hint', author: 'orig-author' });
  });

  it('is null without an e tag', () => {
    expect(repostTarget({ tags: [] })).toBeNull();
  });
});

describe('repostInnerKind', () => {
  it('is always kind 1 for a kind-6 repost', () => {
    expect(repostInnerKind({ kind: 6, tags: [] })).toBe(1);
  });

  it('reads the k tag for a generic kind-16 repost', () => {
    // The k tag lets a reader decide whether it can render the target
    // before going to the network.
    expect(repostInnerKind({ kind: 16, tags: [['k', '30023']] })).toBe(30023);
  });

  it('is null for a kind-16 with no k tag', () => {
    expect(repostInnerKind({ kind: 16, tags: [] })).toBeNull();
  });
});

describe('embeddedRepostEvent', () => {
  it('parses the stringified original out of content', () => {
    const original = ev({ id: 'orig', pubkey: 'author', content: 'hello' });
    expect(embeddedRepostEvent({ content: JSON.stringify(original) })?.id).toBe('orig');
  });

  it('returns null for empty content, so the e-tag path is used', () => {
    // Empty content is spec-legal and Primal has a rescue path for it.
    expect(embeddedRepostEvent({ content: '' })).toBeNull();
  });

  it('returns null for a plain comment rather than throwing', () => {
    expect(embeddedRepostEvent({ content: 'nice post!' })).toBeNull();
  });

  it('rejects JSON that is not an event', () => {
    expect(embeddedRepostEvent({ content: '{"foo":1}' })).toBeNull();
  });
});

describe('groupReposts', () => {
  it('keeps every reposter of the same note, not just the first', () => {
    // The old dedupe discarded duplicates outright, so the count — the whole
    // signal a repost carries — was lost.
    const notes = [
      ev({ id: 'r1', pubkey: 'gigi', kind: 6, tags: [['e', 'popular']] }),
      ev({ id: 'r2', pubkey: 'jb55', kind: 6, tags: [['e', 'popular']] }),
      ev({ id: 'r3', pubkey: 'alice', kind: 6, tags: [['e', 'popular']] }),
    ];
    const { notes: rows, repostersByTarget } = groupReposts(notes);
    expect(rows.map((n) => n.id)).toEqual(['r1']);
    expect(repostersByTarget.get('popular')).toEqual(['gigi', 'jb55', 'alice']);
  });

  it('counts one person reposting twice as one voucher', () => {
    const notes = [
      ev({ id: 'r1', pubkey: 'gigi', kind: 6, tags: [['e', 'popular']] }),
      ev({ id: 'r2', pubkey: 'gigi', kind: 6, tags: [['e', 'popular']] }),
    ];
    expect(groupReposts(notes).repostersByTarget.get('popular')).toEqual(['gigi']);
  });

  it('lets the original win the row when it is also in the window', () => {
    // Otherwise a note you already had appears twice — once alone, once
    // wrapped in someone's repost.
    const notes = [
      ev({ id: 'popular', pubkey: 'author' }),
      ev({ id: 'r1', pubkey: 'gigi', kind: 6, tags: [['e', 'popular']] }),
    ];
    const { notes: rows, repostersByTarget } = groupReposts(notes);
    expect(rows.map((n) => n.id)).toEqual(['popular']);
    expect(repostersByTarget.get('popular')).toEqual(['gigi']);
  });

  it('keeps an unresolvable repost as its own row rather than dropping it', () => {
    const orphan = ev({ id: 'r1', kind: 6, tags: [] });
    expect(groupReposts([orphan]).notes.map((n) => n.id)).toEqual(['r1']);
  });

  it('preserves ordinary notes and their order', () => {
    const notes = [ev({ id: 'a' }), ev({ id: 'b' }), ev({ id: 'c' })];
    expect(groupReposts(notes).notes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('records reposters newest-first, following the input order', () => {
    const notes = [
      ev({ id: 'r1', pubkey: 'newest', kind: 6, created_at: 300, tags: [['e', 'x']] }),
      ev({ id: 'r2', pubkey: 'oldest', kind: 6, created_at: 100, tags: [['e', 'x']] }),
    ];
    expect(groupReposts(notes).repostersByTarget.get('x')).toEqual(['newest', 'oldest']);
  });
});

describe('dedupeReposts', () => {
  it('keeps only the first repost of a given target', () => {
    // A popular note reposted by eight people you follow should occupy one
    // row, not eight consecutive ones.
    const notes = [
      ev({ id: 'r1', kind: 6, tags: [['e', 'popular']] }),
      ev({ id: 'r2', kind: 6, tags: [['e', 'popular']] }),
      ev({ id: 'r3', kind: 6, tags: [['e', 'other']] }),
    ];
    expect(dedupeReposts(notes).map((n) => n.id)).toEqual(['r1', 'r3']);
  });

  it('never collapses ordinary notes', () => {
    const notes = [ev({ id: 'a' }), ev({ id: 'b' })];
    expect(dedupeReposts(notes)).toHaveLength(2);
  });
});
