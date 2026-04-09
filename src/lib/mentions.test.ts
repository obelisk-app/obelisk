import { describe, it, expect } from 'vitest';
import { parseMentions, serializeMention, filterMembers, MemberInfo } from './mentions';

const members: MemberInfo[] = [
  { pubkey: 'a'.repeat(64), displayName: 'Alice' },
  { pubkey: 'b'.repeat(64), displayName: 'Bob' },
  { pubkey: 'c'.repeat(64), displayName: 'Charlie' },
];

describe('serializeMention', () => {
  it('creates nostr:npub1<pubkey> format', () => {
    expect(serializeMention('a'.repeat(64))).toBe(`nostr:npub1${'a'.repeat(64)}`);
  });
});

describe('parseMentions', () => {
  it('returns single text segment for plain text', () => {
    const result = parseMentions('hello world', members);
    expect(result).toEqual([{ type: 'text', text: 'hello world' }]);
  });

  it('parses a mention in the middle of text', () => {
    const content = `hey nostr:npub1${'a'.repeat(64)} check this`;
    const result = parseMentions(content, members);
    expect(result).toEqual([
      { type: 'text', text: 'hey ' },
      { type: 'mention', pubkey: 'a'.repeat(64), displayName: 'Alice' },
      { type: 'text', text: ' check this' },
    ]);
  });

  it('parses multiple mentions', () => {
    const content = `nostr:npub1${'a'.repeat(64)} and nostr:npub1${'b'.repeat(64)}`;
    const result = parseMentions(content, members);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: 'mention', pubkey: 'a'.repeat(64), displayName: 'Alice' });
    expect(result[1]).toEqual({ type: 'text', text: ' and ' });
    expect(result[2]).toEqual({ type: 'mention', pubkey: 'b'.repeat(64), displayName: 'Bob' });
  });

  it('shows truncated pubkey for unknown members', () => {
    const unknownPk = 'd'.repeat(64);
    const content = `nostr:npub1${unknownPk}`;
    const result = parseMentions(content, members);
    expect(result[0]).toEqual({
      type: 'mention',
      pubkey: unknownPk,
      displayName: 'dddddddd...',
    });
  });

  it('roundtrips with serializeMention', () => {
    const pk = 'a'.repeat(64);
    const content = `hello ${serializeMention(pk)} world`;
    const result = parseMentions(content, members);
    expect(result).toEqual([
      { type: 'text', text: 'hello ' },
      { type: 'mention', pubkey: pk, displayName: 'Alice' },
      { type: 'text', text: ' world' },
    ]);
  });
});

describe('filterMembers', () => {
  it('filters by display name', () => {
    expect(filterMembers(members, 'ali')).toEqual([members[0]]);
  });

  it('filters by pubkey prefix', () => {
    expect(filterMembers(members, 'bbb')).toEqual([members[1]]);
  });

  it('returns empty for no match', () => {
    expect(filterMembers(members, 'xyz')).toEqual([]);
  });

  it('is case insensitive', () => {
    expect(filterMembers(members, 'ALICE')).toEqual([members[0]]);
  });
});
