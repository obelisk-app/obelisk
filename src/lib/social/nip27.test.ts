import { describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';
import {
  decodeNostrEntity,
  encodeEventRef,
  encodeMention,
  mentionedPubkeys,
  referencedEvents,
  tokenizeContent,
} from './nip27';

const PK = 'a'.repeat(64);
const ID = 'b'.repeat(64);
const npub = nip19.npubEncode(PK);
const nevent = nip19.neventEncode({ id: ID, author: PK });

describe('decodeNostrEntity', () => {
  it('decodes npub and nprofile to a pubkey ref', () => {
    expect(decodeNostrEntity(npub)).toMatchObject({ type: 'pubkey', pubkey: PK });
    const nprofile = nip19.nprofileEncode({ pubkey: PK, relays: ['wss://r.example'] });
    expect(decodeNostrEntity(nprofile)).toMatchObject({
      type: 'pubkey',
      pubkey: PK,
      relays: ['wss://r.example'],
    });
  });

  it('decodes note and nevent to an event ref', () => {
    expect(decodeNostrEntity(nip19.noteEncode(ID))).toMatchObject({ type: 'event', id: ID });
    expect(decodeNostrEntity(nevent)).toMatchObject({ type: 'event', id: ID, author: PK });
  });

  it('returns null for garbage rather than throwing', () => {
    // A feed renders whatever strangers published; a bad entity must not
    // take down the note.
    expect(decodeNostrEntity('npub1notvalid')).toBeNull();
    expect(decodeNostrEntity('')).toBeNull();
  });
});

describe('tokenizeContent', () => {
  it('splits text around a mention, preserving order', () => {
    const tokens = tokenizeContent(`hey nostr:${npub} how are you`);
    expect(tokens.map((t) => t.kind)).toEqual(['text', 'ref', 'text']);
    expect(tokens[0]).toEqual({ kind: 'text', value: 'hey ' });
    expect(tokens[2]).toEqual({ kind: 'text', value: ' how are you' });
  });

  it('leaves content with no references as a single text run', () => {
    expect(tokenizeContent('just a note')).toEqual([{ kind: 'text', value: 'just a note' }]);
  });

  it('leaves an undecodable nostr: URI as plain text', () => {
    const tokens = tokenizeContent('see nostr:npub1bogus');
    expect(tokens.every((t) => t.kind === 'text')).toBe(true);
  });

  it('handles several references in one note', () => {
    const tokens = tokenizeContent(`nostr:${npub} and nostr:${nevent}`);
    expect(tokens.filter((t) => t.kind === 'ref')).toHaveLength(2);
  });
});

describe('mentionedPubkeys / referencedEvents', () => {
  it('extracts pubkeys for p tags', () => {
    expect(mentionedPubkeys(`hi nostr:${npub}`)).toEqual([PK]);
  });

  it('dedupes repeated mentions', () => {
    expect(mentionedPubkeys(`nostr:${npub} nostr:${npub}`)).toEqual([PK]);
  });

  it('extracts event refs for q tags', () => {
    expect(referencedEvents(`quoting nostr:${nevent}`)).toEqual([
      { id: ID, author: PK, relays: [] },
    ]);
  });
});

describe('encoders', () => {
  it('round-trips a mention', () => {
    const encoded = encodeMention(PK);
    expect(encoded).toBe(`nostr:${npub}`);
    expect(mentionedPubkeys(encoded)).toEqual([PK]);
  });

  it('uses nprofile when relay hints are available', () => {
    expect(encodeMention(PK, ['wss://r.example'])).toContain('nostr:nprofile1');
  });

  it('round-trips an event reference', () => {
    expect(referencedEvents(encodeEventRef(ID, { author: PK }))[0].id).toBe(ID);
  });

  it('returns an empty string for an invalid pubkey instead of throwing', () => {
    expect(encodeMention('not-hex')).toBe('');
  });
});
