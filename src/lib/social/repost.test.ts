import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import {
  dedupeReposts,
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
