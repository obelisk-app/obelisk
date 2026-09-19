import { describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';
import type { Event as NostrEvent } from 'nostr-tools';
import { groupIdOf, groupNoteUrl, hashtagUrl, noteIdentifier, noteShareUrl, profileUrl, rawEventJson } from './note-links';

const PK = 'a'.repeat(64);
const ID = 'b'.repeat(64);

const ev = (over: Partial<NostrEvent> = {}): NostrEvent => ({
  id: ID,
  pubkey: PK,
  content: 'hello',
  created_at: 1000,
  tags: [],
  kind: 1,
  sig: '',
  ...over,
});

describe('noteIdentifier', () => {
  it('encodes an nevent carrying author and relay hints', () => {
    // A bare id gives a reader nothing to look it up with; nevent carries
    // where to find it and who wrote it.
    const encoded = noteIdentifier(ev(), ['wss://a.example']);
    expect(encoded.startsWith('nevent1')).toBe(true);
    const decoded = nip19.decode(encoded);
    expect(decoded.type).toBe('nevent');
    expect((decoded.data as { id: string }).id).toBe(ID);
    expect((decoded.data as { author?: string }).author).toBe(PK);
  });

  it('uses naddr for addressable kinds, not nevent', () => {
    // An nevent would pin one revision of an article that gets edited.
    const article = ev({ kind: 30023, tags: [['d', 'my-post']] });
    const encoded = noteIdentifier(article);
    expect(encoded.startsWith('naddr1')).toBe(true);
    const decoded = nip19.decode(encoded);
    expect(decoded.data).toMatchObject({ identifier: 'my-post', kind: 30023, pubkey: PK });
  });

  it('caps relay hints so the identifier stays a sane length', () => {
    const many = ['wss://a', 'wss://b', 'wss://c', 'wss://d', 'wss://e'].map((r) => `${r}.example`);
    const decoded = nip19.decode(noteIdentifier(ev(), many));
    expect((decoded.data as { relays?: string[] }).relays).toHaveLength(3);
  });

  it('falls back to the raw id rather than throwing', () => {
    expect(noteIdentifier({ id: 'not-hex', pubkey: 'bad', kind: 1, tags: [] })).toBe('not-hex');
  });
});

describe('share urls', () => {
  it('points at our own viewer, not njump', () => {
    // Sharing used to hand the reader to a third party and give njump the
    // link preview.
    const url = noteShareUrl(ev());
    expect(url).toContain('/notes/');
    expect(url).not.toContain('njump.me');
  });

  it('never emits an njump link', () => {
    // Pointing at njump handed readers to a third party, gave that third
    // party the preview card, and made an Obelisk link a dead end for
    // getting people into Obelisk.
    expect(noteShareUrl(ev())).not.toContain('njump');
    expect(profileUrl(PK)).not.toContain('njump');
    expect(hashtagUrl('Nostr')).not.toContain('njump');
  });

  it('links profiles and hashtags to our own routes', () => {
    expect(profileUrl(PK)).toMatch(/\/p\/npub1/);
    // Hashtags are lowercase on the wire, so the URL is too.
    expect(hashtagUrl('Bitcoin')).toBe('/t/bitcoin');
  });
});

describe('group-originated notes', () => {
  it('reads the NIP-29 group from the h tag', () => {
    expect(groupIdOf(ev({ tags: [['h', 'my-group']] }))).toBe('my-group');
    expect(groupIdOf(ev())).toBeNull();
  });

  it('points back to the group view, carrying the message id', () => {
    // A group note's replies and people live in the group; a standalone
    // note page strands the reader.
    const url = groupNoteUrl(ev({ tags: [['h', 'my-group']] }), 'wss://relay.example');
    const parsed = new URL(url!);
    expect(parsed.pathname).toBe('/app');
    expect(parsed.searchParams.get('c')).toBe('my-group');
    expect(parsed.searchParams.get('m')).toBe(ID);
    // The shell's `?relay=` param wants a host, not a wss:// URL.
    expect(parsed.searchParams.get('relay')).toBe('relay.example');
  });

  it('has no group link for an ordinary note', () => {
    expect(groupNoteUrl(ev(), 'wss://relay.example')).toBeNull();
  });
});

describe('rawEventJson', () => {
  it('pretty-prints the whole event for inspection', () => {
    const json = rawEventJson(ev({ tags: [['t', 'nostr']] }));
    expect(JSON.parse(json)).toMatchObject({ id: ID, pubkey: PK, kind: 1 });
    expect(json).toContain('\n');
  });
});
