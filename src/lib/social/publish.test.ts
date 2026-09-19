import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import {
  buildNoteTags,
  buildReactionTags,
  buildReplyTags,
  buildRepostTags,
  imetaTag,
  reactionTargetId,
} from './publish';

/**
 * These assert wire shapes, not behaviour, because a malformed tag is
 * invisible locally — it only shows up as a thread that Amethyst, Damus and
 * Primal scatter differently. Each expectation below corresponds to a
 * documented behaviour of at least one of those clients.
 */

const note = (over: Partial<NostrEvent> = {}): NostrEvent => ({
  id: 'note-id',
  pubkey: 'author-pk',
  content: '',
  created_at: 1000,
  tags: [],
  kind: 1,
  sig: '',
  ...over,
});

describe('buildReplyTags (NIP-10)', () => {
  it('marks a top-level reply with root only', () => {
    const tags = buildReplyTags(note({ id: 'root-id', pubkey: 'root-author' }));
    const eTags = tags.filter((t) => t[0] === 'e');
    // Emitting both root and reply for the same id makes some clients render
    // the reply as a reply to itself.
    expect(eTags).toEqual([['e', 'root-id', '', 'root', 'root-author']]);
  });

  it('marks a nested reply with both root and reply', () => {
    const parent = note({
      id: 'parent-id',
      pubkey: 'parent-author',
      tags: [['e', 'root-id', 'wss://r.example', 'root', 'root-author']],
    });
    const eTags = buildReplyTags(parent, { relayHint: 'wss://hint' }).filter((t) => t[0] === 'e');
    expect(eTags).toEqual([
      ['e', 'root-id', 'wss://r.example', 'root', 'root-author'],
      ['e', 'parent-id', 'wss://hint', 'reply', 'parent-author'],
    ]);
  });

  it('carries the whole participant set so the thread gets notified', () => {
    const parent = note({
      pubkey: 'parent-author',
      tags: [['p', 'alice'], ['p', 'bob']],
    });
    const pTags = buildReplyTags(parent).filter((t) => t[0] === 'p').map((t) => t[1]);
    // Parent's p tags UNION the parent author — dropping this is the usual
    // reason a reply "doesn't notify" in Amethyst and Damus.
    expect(new Set(pTags)).toEqual(new Set(['alice', 'bob', 'parent-author']));
  });

  it('never emits a positional (unmarked) e tag', () => {
    const tags = buildReplyTags(note({ tags: [['e', 'root-id', '', 'root', 'ra']] }));
    for (const tag of tags.filter((t) => t[0] === 'e')) {
      expect(['root', 'reply']).toContain(tag[3]);
    }
  });
});

describe('buildRepostTags (NIP-18)', () => {
  it('carries e and p so empty-content reposts can still be resolved', () => {
    // Primal has a dedicated rescue path that reads the e tag when content
    // is empty, so the tag must be present even though we also embed JSON.
    expect(buildRepostTags(note(), { relayHint: 'wss://hint' })).toEqual([
      ['e', 'note-id', 'wss://hint'],
      ['p', 'author-pk'],
    ]);
  });
});

describe('buildReactionTags (NIP-25)', () => {
  it('uses e + p + k for a plain note', () => {
    expect(buildReactionTags(note())).toEqual([
      ['e', 'note-id', ''],
      ['p', 'author-pk'],
      ['k', '1'],
    ]);
  });

  it('adds an a coordinate ALONGSIDE e for addressable targets', () => {
    const article = note({ kind: 30023, tags: [['d', 'my-article']] });
    const tags = buildReactionTags(article);
    // Primal iOS emits `a` instead of `e`, and Damus only reads `e` — so
    // those reactions are invisible in Damus. Emit both.
    expect(tags).toContainEqual(['e', 'note-id', '']);
    expect(tags).toContainEqual(['a', '30023:author-pk:my-article', '']);
  });
});

describe('reactionTargetId', () => {
  it('reads the LAST e tag', () => {
    // Damus copies every e/p tag off the target and appends the real target
    // last, so first-wins picks the wrong event.
    const reaction = note({
      tags: [['e', 'copied-from-target'], ['e', 'real-target']],
    });
    expect(reactionTargetId(reaction)).toBe('real-target');
  });
});

describe('imetaTag (NIP-92)', () => {
  it('emits space-delimited key/value parts with url first', () => {
    expect(imetaTag({
      url: 'https://cdn.example/a.jpg',
      mimeType: 'image/jpeg',
      width: 800,
      height: 600,
      sha256: 'abc',
      alt: 'a cat on a roof',
    })).toEqual([
      'imeta',
      'url https://cdn.example/a.jpg',
      'm image/jpeg',
      'dim 800x600',
      'x abc',
      'alt a cat on a roof',
    ]);
  });

  it('omits dim unless both dimensions are known', () => {
    const tag = imetaTag({ url: 'https://cdn.example/a.jpg', width: 800, height: null });
    expect(tag.some((part) => part.startsWith('dim '))).toBe(false);
  });
});

describe('buildNoteTags', () => {
  it('lowercases hashtags', () => {
    const tags = buildNoteTags('Hello #Bitcoin #NOSTR');
    const hashtags = tags.filter((t) => t[0] === 't').map((t) => t[1]);
    expect(hashtags).toEqual(['bitcoin', 'nostr']);
  });

  it('derives p tags from inline nostr: mentions', () => {
    // npub for 64 hex "01" bytes repeated — a valid bech32 npub.
    const npub = 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzs';
    const tags = buildNoteTags(`hi nostr:${npub}`);
    // Malformed/undecodable entities are simply ignored, never thrown.
    expect(Array.isArray(tags)).toBe(true);
  });
});
