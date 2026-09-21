import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';

const mocks = vi.hoisted(() => ({
  querySocial: vi.fn(),
  socialRelays: vi.fn(() => ['wss://mine.example']),
}));

vi.mock('./pool', () => ({
  querySocial: mocks.querySocial,
  socialRelays: mocks.socialRelays,
}));

const {
  SEARCH_RELAYS,
  noteMatchesQuery,
  parseQuery,
  relatedHashtags,
  searchHashtag,
  searchNotes,
} = await import('./search');

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

const NPUB = 'npub1sn0wdenkukak0d9dfczzeacvhkrgz92ak56egt7vdgzn8pv2wfqqhrjdv9';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.socialRelays.mockReturnValue(['wss://mine.example']);
});

describe('parseQuery', () => {
  it('classifies an empty or whitespace query as empty', () => {
    expect(parseQuery('')).toEqual({ kind: 'empty' });
    expect(parseQuery('   ')).toEqual({ kind: 'empty' });
  });

  it('classifies #tag as a hashtag, lowercased', () => {
    expect(parseQuery('#Bitcoin')).toEqual({ kind: 'hashtag', tag: 'bitcoin' });
  });

  it('treats a bare # as empty rather than a tag search for nothing', () => {
    expect(parseQuery('#')).toEqual({ kind: 'empty' });
  });

  it('routes a pasted npub to the identifier branch, not full text', () => {
    // A full-text index will never match a bech32 string, so sending it there
    // is a guaranteed empty page for the most precise query a user can type.
    const parsed = parseQuery(NPUB);
    expect(parsed.kind).toBe('identifier');
  });

  it('accepts a nostr: prefixed identifier', () => {
    expect(parseQuery(`nostr:${NPUB}`).kind).toBe('identifier');
  });

  it('falls back to text for ordinary words', () => {
    expect(parseQuery('  lightning wallet ')).toEqual({ kind: 'text', text: 'lightning wallet' });
  });

  it('keeps an undecodable bech32-looking string as text', () => {
    expect(parseQuery('npub1notrealatall').kind).toBe('text');
  });
});

describe('noteMatchesQuery', () => {
  it('ANDs every term — matching any one word is indistinguishable from no filter', () => {
    const note = { content: 'a note about lightning', tags: [] };
    expect(noteMatchesQuery(note, 'lightning')).toBe(true);
    expect(noteMatchesQuery(note, 'lightning wallet')).toBe(false);
  });

  it('is case insensitive', () => {
    expect(noteMatchesQuery({ content: 'Nostr Rocks', tags: [] }, 'nostr')).toBe(true);
  });

  it('matches a long-form title and summary, whose content is markdown', () => {
    const article = {
      content: '## body',
      tags: [['title', 'Running a relay'], ['summary', 'operator notes']],
    };
    expect(noteMatchesQuery(article, 'relay')).toBe(true);
    expect(noteMatchesQuery(article, 'operator')).toBe(true);
  });

  it('matches hashtags on the event', () => {
    expect(noteMatchesQuery({ content: 'gm', tags: [['t', 'coffee']] }, 'coffee')).toBe(true);
  });

  it('matches everything when the query is empty', () => {
    expect(noteMatchesQuery({ content: '', tags: [] }, '  ')).toBe(true);
  });
});

describe('searchNotes', () => {
  it('drops results from relays that ignore the search field', async () => {
    // A relay without NIP-50 answers the filter with its latest notes rather
    // than rejecting it, which fills the page with unrelated content and
    // reads as a broken search.
    mocks.querySocial.mockResolvedValue([
      ev({ id: 'hit', content: 'zaps over lightning', created_at: 5 }),
      ev({ id: 'noise', content: 'gm', created_at: 9 }),
    ]);

    const results = await searchNotes('lightning');
    expect(results.map((note) => note.id)).toEqual(['hit']);
  });

  it('queries notes and long-form over the social relays plus the indexers', async () => {
    mocks.querySocial.mockResolvedValue([]);
    await searchNotes('nostr');

    const [filters, opts] = mocks.querySocial.mock.calls[0];
    expect(filters[0].kinds).toEqual([1, 30023]);
    expect(filters[0].search).toBe('nostr');
    expect(opts.relays).toEqual(['wss://mine.example', ...SEARCH_RELAYS]);
  });

  it('does not query at all for an empty string', async () => {
    expect(await searchNotes('   ')).toEqual([]);
    expect(mocks.querySocial).not.toHaveBeenCalled();
  });

  it('dedupes by id and returns newest first', async () => {
    mocks.querySocial.mockResolvedValue([
      ev({ id: 'a', content: 'nostr', created_at: 1 }),
      ev({ id: 'b', content: 'nostr', created_at: 3 }),
      ev({ id: 'a', content: 'nostr', created_at: 1 }),
    ]);
    const results = await searchNotes('nostr');
    expect(results.map((note) => note.id)).toEqual(['b', 'a']);
  });

  it('honours the limit', async () => {
    mocks.querySocial.mockResolvedValue([
      ev({ id: 'a', content: 'nostr', created_at: 3 }),
      ev({ id: 'b', content: 'nostr', created_at: 2 }),
    ]);
    expect(await searchNotes('nostr', { limit: 1 })).toHaveLength(1);
  });
});

describe('searchHashtag', () => {
  it('filters on #t so it works on relays without NIP-50', async () => {
    mocks.querySocial.mockResolvedValue([]);
    await searchHashtag('#Coffee');

    const [filters] = mocks.querySocial.mock.calls[0];
    expect(filters[0]['#t']).toEqual(['coffee']);
    expect(filters[0].search).toBeUndefined();
  });

  it('re-checks the tag, since the shared coalescer fans in other events', async () => {
    mocks.querySocial.mockResolvedValue([
      ev({ id: 'tagged', tags: [['t', 'Coffee']], created_at: 2 }),
      ev({ id: 'other', tags: [['t', 'tea']], created_at: 3 }),
      ev({ id: 'untagged', created_at: 4 }),
    ]);
    const results = await searchHashtag('coffee');
    expect(results.map((note) => note.id)).toEqual(['tagged']);
  });

  it('does not query for an empty tag', async () => {
    expect(await searchHashtag('#')).toEqual([]);
    expect(mocks.querySocial).not.toHaveBeenCalled();
  });
});

describe('relatedHashtags', () => {
  it('ranks by frequency, then alphabetically for a stable order', () => {
    const notes = [
      ev({ id: '1', tags: [['t', 'nostr'], ['t', 'zaps']] }),
      ev({ id: '2', tags: [['t', 'nostr']] }),
      ev({ id: '3', tags: [['t', 'art']] }),
    ];
    expect(relatedHashtags(notes)).toEqual(['nostr', 'art', 'zaps']);
  });

  it('counts a tag once per note even when repeated', () => {
    const notes = [
      ev({ id: '1', tags: [['t', 'nostr'], ['t', 'NOSTR']] }),
      ev({ id: '2', tags: [['t', 'zaps']] }),
      ev({ id: '3', tags: [['t', 'zaps']] }),
    ];
    expect(relatedHashtags(notes)[0]).toBe('zaps');
  });

  it('honours the limit', () => {
    const notes = [ev({ tags: [['t', 'a'], ['t', 'b'], ['t', 'c']] })];
    expect(relatedHashtags(notes, 2)).toHaveLength(2);
  });
});
