import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';

const mocks = vi.hoisted(() => ({
  querySocial: vi.fn(),
  relaysForAuthor: vi.fn(),
}));

vi.mock('./pool', () => ({ querySocial: mocks.querySocial, socialRelays: () => ['wss://mine'] }));

vi.mock('@nostr-wot/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nostr-wot/data')>();
  return { ...actual, relaysForAuthor: mocks.relaysForAuthor };
});

const { loadProfileFeed, _resetAuthorRelayCache } = await import('./feed');

const AUTHOR = 'a'.repeat(64);
const MINE = ['wss://mine.example'];
const THEIRS = ['wss://their-relay.example', ...MINE];

const note = (id: string, over: Partial<NostrEvent> = {}): NostrEvent => ({
  id,
  pubkey: AUTHOR,
  kind: 1,
  content: '',
  created_at: 100,
  tags: [],
  sig: '',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  _resetAuthorRelayCache();
  mocks.relaysForAuthor.mockResolvedValue(THEIRS);
  mocks.querySocial.mockResolvedValue([]);
});

describe('loadProfileFeed — outbox model', () => {
  it('reads from where the author publishes, not just the reader’s relays', async () => {
    // The old path passed our relays straight to the SDK, whose signature is
    // `options.relays ?? relaysForAuthor(pubkey)` — so the outbox lookup
    // never ran and the profile said "that's everything these relays have".
    await loadProfileFeed(AUTHOR, { relays: MINE });

    expect(mocks.relaysForAuthor).toHaveBeenCalledWith(AUTHOR, MINE);
    expect(mocks.querySocial.mock.calls[0][1]).toEqual({ relays: THEIRS });
  });

  it('keeps our relays in the union, for an author with no relay list', async () => {
    // `relaysForAuthor` falls back to the defaults it was given.
    mocks.relaysForAuthor.mockResolvedValue(MINE);
    await loadProfileFeed(AUTHOR, { relays: MINE });
    expect(mocks.querySocial.mock.calls[0][1]).toEqual({ relays: MINE });
  });

  it('falls back to our relays when the relay-list lookup fails', async () => {
    mocks.relaysForAuthor.mockRejectedValue(new Error('unreachable'));
    await loadProfileFeed(AUTHOR, { relays: MINE });
    expect(mocks.querySocial.mock.calls[0][1]).toEqual({ relays: MINE });
  });

  it('resolves the relay list once per author, not once per page', async () => {
    // A profile feed pages; re-resolving NIP-65 per scroll is a round trip
    // per page for an answer that does not change.
    await loadProfileFeed(AUTHOR, { relays: MINE });
    await loadProfileFeed(AUTHOR, { relays: MINE, until: 50 });
    expect(mocks.relaysForAuthor).toHaveBeenCalledTimes(1);
  });

  it('asks for every feed kind, not only kind 1', async () => {
    // `fetchNotesByAuthor` is kinds:[1], which is why a profile's articles
    // and pictures were invisible and the Media tab looked empty.
    await loadProfileFeed(AUTHOR, { relays: MINE });
    const kinds = mocks.querySocial.mock.calls[0][0][0].kinds as number[];
    expect(kinds).toContain(1);
    expect(kinds).toContain(30023);
    expect(kinds).toContain(20);
  });

  it('narrows the REQ when a content filter is active', async () => {
    await loadProfileFeed(AUTHOR, { relays: MINE, filter: 'articles' });
    expect(mocks.querySocial.mock.calls[0][0][0].kinds).toEqual([30023, 9802]);
  });

  it('pages with an until cursor', async () => {
    await loadProfileFeed(AUTHOR, { relays: MINE, until: 1234 });
    expect(mocks.querySocial.mock.calls[0][0][0].until).toBe(1234);
  });

  it('drops other authors the coalescer fanned in', async () => {
    mocks.querySocial.mockResolvedValue([
      note('mine'),
      note('stranger', { pubkey: 'b'.repeat(64) }),
    ]);
    const result = await loadProfileFeed(AUTHOR, { relays: MINE });
    expect(result.map((event) => event.id)).toEqual(['mine']);
  });

  it('returns nothing rather than querying every relay it knows', async () => {
    mocks.relaysForAuthor.mockResolvedValue([]);
    expect(await loadProfileFeed(AUTHOR, { relays: [] })).toEqual([]);
    expect(mocks.querySocial).not.toHaveBeenCalled();
  });
});
