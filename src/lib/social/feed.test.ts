import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import {
  AUTHORS_PER_FILTER,
  noteMatchesSource,
  chunkAuthors,
  isReplyNote,
  mergeNotes,
  nextCursor,
  oldestCreatedAt,
  applyModeration,
} from './feed';

const note = (id: string, createdAt: number, over: Partial<NostrEvent> = {}): NostrEvent => ({
  id,
  pubkey: 'pk',
  content: '',
  created_at: createdAt,
  tags: [],
  kind: 1,
  sig: '',
  ...over,
});

describe('mergeNotes', () => {
  it('dedupes by id and sorts newest first', () => {
    const merged = mergeNotes([note('a', 100)], [note('b', 300), note('a', 100), note('c', 200)]);
    expect(merged.map((n) => n.id)).toEqual(['b', 'c', 'a']);
  });

  it('breaks created_at ties deterministically so the list does not shuffle', () => {
    const first = mergeNotes([], [note('y', 100), note('x', 100)]);
    const second = mergeNotes([], [note('x', 100), note('y', 100)]);
    expect(first.map((n) => n.id)).toEqual(second.map((n) => n.id));
  });

  it('caps the result', () => {
    const many = Array.from({ length: 20 }, (_, i) => note(`n${i}`, i));
    expect(mergeNotes([], many, 5)).toHaveLength(5);
  });

  it('keeps existing notes when nothing new arrives', () => {
    const current = [note('a', 100)];
    expect(mergeNotes(current, [])).toEqual(current);
  });
});

describe('pagination cursor', () => {
  it('uses the oldest created_at as the until cursor', () => {
    const notes = [note('a', 300), note('b', 100), note('c', 200)];
    expect(oldestCreatedAt(notes)).toBe(100);
    expect(nextCursor(notes)).toBe(100);
  });

  it('has no cursor for an empty page', () => {
    expect(nextCursor([])).toBeUndefined();
    expect(oldestCreatedAt([])).toBeNull();
  });

  it('overlaps rather than skipping — the boundary note is re-fetched and deduped', () => {
    // `until` is inclusive relay-side. Stepping back a second would risk
    // dropping notes that share the boundary timestamp.
    const page = [note('a', 300), note('b', 100)];
    const cursor = nextCursor(page)!;
    const nextPage = [note('b', 100), note('c', 50)];
    const merged = mergeNotes(page, nextPage);
    expect(cursor).toBe(100);
    expect(merged.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('chunkAuthors', () => {
  it('splits big follow lists so relays do not reject the filter', () => {
    const authors = Array.from({ length: 750 }, (_, i) => `pk${i}`);
    const chunks = chunkAuthors(authors);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(AUTHORS_PER_FILTER);
    expect(chunks.flat()).toHaveLength(750);
  });

  it('returns nothing for an empty follow list', () => {
    expect(chunkAuthors([])).toEqual([]);
  });
});

describe('isReplyNote', () => {
  it('treats a marked reply as a reply', () => {
    expect(isReplyNote({ tags: [['e', 'root', '', 'root', 'pk']] })).toBe(true);
  });

  it('does NOT treat a quote as a reply', () => {
    // The old `isReply` counted any e tag, so quotes and event mentions were
    // misfiled into the Replies tab.
    expect(isReplyNote({ tags: [['q', 'quoted-id', '', 'pk']] })).toBe(false);
  });

  it('is false for a plain note', () => {
    expect(isReplyNote({ tags: [['t', 'nostr']] })).toBe(false);
  });
});

describe('noteMatchesSource', () => {
  const FOLLOWED = 'f'.repeat(64);
  const STRANGER = 'a'.repeat(64);

  it('rejects authors you do not follow', () => {
    // The shared coalescer hands every consumer's events to every handle, so
    // without this the Following feed fills with whoever replied to anything.
    const source = { kind: 'following' as const, authors: [FOLLOWED] };
    expect(noteMatchesSource({ pubkey: FOLLOWED, kind: 1 }, source)).toBe(true);
    expect(noteMatchesSource({ pubkey: STRANGER, kind: 1 }, source)).toBe(false);
  });

  it('restricts a profile feed to that author', () => {
    const source = { kind: 'profile' as const, pubkey: FOLLOWED };
    expect(noteMatchesSource({ pubkey: FOLLOWED, kind: 1 }, source)).toBe(true);
    expect(noteMatchesSource({ pubkey: STRANGER, kind: 1 }, source)).toBe(false);
  });

  it('accepts any author on the global feed', () => {
    expect(noteMatchesSource({ pubkey: STRANGER, kind: 1 }, { kind: 'global' })).toBe(true);
  });

  it('rejects kinds the feed never requested', () => {
    // Reactions and zap receipts are counted, not listed.
    expect(noteMatchesSource({ pubkey: STRANGER, kind: 7 }, { kind: 'global' })).toBe(false);
    expect(noteMatchesSource({ pubkey: STRANGER, kind: 9735 }, { kind: 'global' })).toBe(false);
  });

  it('uses a prebuilt author set when given one', () => {
    const source = { kind: 'following' as const, authors: [] };
    expect(noteMatchesSource({ pubkey: FOLLOWED, kind: 1 }, source, new Set([FOLLOWED]))).toBe(true);
  });
});

describe('applyModeration', () => {
  it('hides notes from muted or blocked authors', () => {
    const notes = [note('a', 1, { pubkey: 'good' }), note('b', 2, { pubkey: 'bad' })];
    expect(applyModeration(notes, (pk) => pk === 'bad').map((n) => n.id)).toEqual(['a']);
  });
});
