import { describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';
import { parseIdentifier, safeRelayHints } from './identifier';

const PK = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d';
const ID = 'b'.repeat(64);

describe('parseIdentifier', () => {
  it('accepts a bare hex event id', () => {
    expect(parseIdentifier(ID)).toEqual({ kind: 'event', id: ID, relays: [] });
  });

  it('accepts note1 and nevent1', () => {
    expect(parseIdentifier(nip19.noteEncode(ID))).toMatchObject({ kind: 'event', id: ID });
    const nevent = nip19.neventEncode({ id: ID, relays: ['wss://a.example'] });
    expect(parseIdentifier(nevent)).toMatchObject({ kind: 'event', id: ID, relays: ['wss://a.example'] });
  });

  it('accepts npub1 and nprofile1 as profiles', () => {
    expect(parseIdentifier(nip19.npubEncode(PK))).toMatchObject({ kind: 'profile', pubkey: PK });
    const nprofile = nip19.nprofileEncode({ pubkey: PK, relays: ['wss://a.example'] });
    expect(parseIdentifier(nprofile)).toMatchObject({ kind: 'profile', pubkey: PK });
  });

  it('accepts naddr1 as an addressable coordinate', () => {
    const naddr = nip19.naddrEncode({ identifier: 'post', pubkey: PK, kind: 30023 });
    expect(parseIdentifier(naddr)).toMatchObject({
      kind: 'address',
      identifier: 'post',
      pubkey: PK,
      eventKind: 30023,
    });
  });

  it('tolerates a nostr: prefix and surrounding whitespace, because people paste those', () => {
    expect(parseIdentifier(`  nostr:${nip19.noteEncode(ID)} `)).toMatchObject({ kind: 'event', id: ID });
  });

  it('returns null for junk rather than throwing', () => {
    expect(parseIdentifier('')).toBeNull();
    expect(parseIdentifier('hello')).toBeNull();
    expect(parseIdentifier('npub1notreal')).toBeNull();
    expect(parseIdentifier('%%%')).toBeNull();
  });
});

describe('safeRelayHints', () => {
  it('keeps public wss relays', () => {
    expect(safeRelayHints(['wss://relay.example/'])).toEqual(['wss://relay.example']);
  });

  it('rejects anything that could aim a server socket at the host network', () => {
    // Relay hints ride inside a user-supplied identifier, so they are
    // attacker-controlled input on a server-side fetch.
    expect(safeRelayHints([
      'ws://relay.example',
      'http://relay.example',
      'wss://localhost:7777',
      'wss://127.0.0.1',
      'wss://10.0.0.5',
      'wss://192.168.1.10',
      'wss://172.16.0.1',
      'wss://169.254.1.1',
      'wss://thing.local',
      'wss://abc.onion',
      'garbage',
    ])).toEqual([]);
  });

  it('caps how many hints it will use', () => {
    const many = Array.from({ length: 10 }, (_, i) => `wss://r${i}.example`);
    expect(safeRelayHints(many)).toHaveLength(3);
    expect(safeRelayHints(many, 5)).toHaveLength(5);
  });
});
