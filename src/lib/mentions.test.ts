import { describe, it, expect } from 'vitest';
import { nip19 } from 'nostr-tools';
import {
  parseMentions,
  serializeMention,
  filterMembers,
  extractMentionPubkeys,
  contentToDisplayTokens,
  displayTokensToContent,
  shortNpub,
  MemberInfo,
} from './mentions';

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

  it('shows truncated npub for unknown members', () => {
    const unknownPk = 'd'.repeat(64);
    const content = `nostr:npub1${unknownPk}`;
    const result = parseMentions(content, members);
    expect(result[0]).toMatchObject({
      type: 'mention',
      pubkey: unknownPk,
    });
    const seg = result[0] as { type: 'mention'; displayName: string };
    expect(seg.displayName.startsWith('npub1')).toBe(true);
    expect(seg.displayName.length).toBeLessThanOrEqual(12);
    expect(seg.displayName).not.toContain(unknownPk);
  });

  it('parses a real bech32 nostr:npub1 mention', () => {
    const pk = 'a'.repeat(64);
    const npub = nip19.npubEncode(pk); // real bech32 npub
    const content = `hey nostr:${npub} there`;
    const result = parseMentions(content, members);
    expect(result).toEqual([
      { type: 'text', text: 'hey ' },
      { type: 'mention', pubkey: pk, displayName: 'Alice' },
      { type: 'text', text: ' there' },
    ]);
  });

  it('parses a bare bech32 npub1 mention (no nostr: prefix)', () => {
    const pk = 'b'.repeat(64);
    const npub = nip19.npubEncode(pk);
    const content = `ping ${npub}!`;
    const result = parseMentions(content, members);
    expect(result[0]).toEqual({ type: 'text', text: 'ping ' });
    expect(result[1]).toEqual({ type: 'mention', pubkey: pk, displayName: 'Bob' });
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

describe('extractMentionPubkeys (server-safe)', () => {
  it('returns empty for plain text', () => {
    expect(extractMentionPubkeys('hello world')).toEqual([]);
  });

  it('extracts a legacy hex mention', () => {
    const pk = 'a'.repeat(64);
    expect(extractMentionPubkeys(`hi nostr:npub1${pk}`)).toEqual([pk]);
  });

  it('extracts a real bech32 nostr:npub1 mention', () => {
    const pk = 'a'.repeat(64);
    const npub = nip19.npubEncode(pk);
    expect(extractMentionPubkeys(`hey nostr:${npub} there`)).toEqual([pk]);
  });

  it('extracts a bare bech32 npub1 mention', () => {
    const pk = 'b'.repeat(64);
    const npub = nip19.npubEncode(pk);
    expect(extractMentionPubkeys(`ping ${npub}!`)).toEqual([pk]);
  });

  it('dedupes repeated mentions of the same pubkey', () => {
    const pk = 'c'.repeat(64);
    const content = `nostr:npub1${pk} and again nostr:npub1${pk}`;
    expect(extractMentionPubkeys(content)).toEqual([pk]);
  });

  it('extracts multiple distinct mentions', () => {
    const pkA = 'a'.repeat(64);
    const pkB = 'b'.repeat(64);
    const content = `nostr:npub1${pkA} and ${nip19.npubEncode(pkB)}`;
    const result = extractMentionPubkeys(content);
    expect(result).toHaveLength(2);
    expect(result).toContain(pkA);
    expect(result).toContain(pkB);
  });

  it('ignores malformed npub bodies', () => {
    // not 64 hex, not valid bech32
    expect(extractMentionPubkeys('nostr:npub1zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz')).toEqual([]);
  });
});

describe('shortNpub', () => {
  it('returns a short npub1-prefixed label', () => {
    const pk = 'a'.repeat(64);
    const out = shortNpub(pk);
    expect(out.startsWith('npub1')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(12);
    expect(out).not.toContain(pk);
  });
});

describe('contentToDisplayTokens / displayTokensToContent', () => {
  const members: MemberInfo[] = [
    { pubkey: 'a'.repeat(64), displayName: 'Alice' },
    { pubkey: 'b'.repeat(64), displayName: 'Bob' },
    // Two different pubkeys that happen to share the same display name.
    // `c`-pubkey is in the members list as "Charlie"; a second user named
    // "Charlie" with a different pubkey exercises the collision path.
    { pubkey: 'c'.repeat(64), displayName: 'Charlie' },
    { pubkey: 'd'.repeat(64), displayName: 'Charlie' },
  ];

  it('replaces a hex mention with a @DisplayName token', () => {
    const content = `hi nostr:npub1${'a'.repeat(64)} welcome`;
    const { display, map } = contentToDisplayTokens(content, members);
    expect(display).toBe('hi @Alice welcome');
    expect(map.get('@Alice')).toBe(serializeMention('a'.repeat(64)));
  });

  it('round-trips a hex mention back to canonical form', () => {
    const canonical = `hi ${serializeMention('a'.repeat(64))} welcome`;
    const { display, map } = contentToDisplayTokens(canonical, members);
    expect(displayTokensToContent(display, map)).toBe(canonical);
  });

  it('round-trips a real bech32 npub mention to canonical hex form', () => {
    const pk = 'b'.repeat(64);
    const bech = nip19.npubEncode(pk);
    const content = `ping nostr:${bech}!`;
    const { display, map } = contentToDisplayTokens(content, members);
    expect(display).toBe('ping @Bob!');
    // Canonicalized to hex form regardless of input.
    expect(displayTokensToContent(display, map)).toBe(`ping ${serializeMention(pk)}!`);
  });

  it('falls back to shortNpub for unknown members', () => {
    const unknown = 'e'.repeat(64);
    const content = `yo nostr:npub1${unknown}`;
    const { display, map } = contentToDisplayTokens(content, members);
    expect(display.startsWith('yo @npub1')).toBe(true);
    // Ends with the ellipsis used by shortNpub.
    expect(display).toContain('…');
    expect([...map.values()]).toEqual([serializeMention(unknown)]);
  });

  it('disambiguates display-name collisions with #N suffixes', () => {
    const content = `nostr:npub1${'c'.repeat(64)} and nostr:npub1${'d'.repeat(64)}`;
    const { display, map } = contentToDisplayTokens(content, members);
    expect(display).toBe('@Charlie and @Charlie#2');
    expect(map.get('@Charlie')).toBe(serializeMention('c'.repeat(64)));
    expect(map.get('@Charlie#2')).toBe(serializeMention('d'.repeat(64)));
    // Re-serialization must replace the #2 token distinctly from the bare one.
    expect(displayTokensToContent(display, map)).toBe(
      `${serializeMention('c'.repeat(64))} and ${serializeMention('d'.repeat(64))}`,
    );
  });

  it('same pubkey twice is still round-trippable', () => {
    const pk = 'a'.repeat(64);
    const content = `${serializeMention(pk)} and ${serializeMention(pk)}`;
    const { display, map } = contentToDisplayTokens(content, members);
    expect(display).toBe('@Alice and @Alice#2');
    // Both tokens map back to the same canonical form.
    expect(displayTokensToContent(display, map)).toBe(content);
  });

  it('leaves plain text untouched with no mentions', () => {
    const { display, map } = contentToDisplayTokens('nothing to see here', members);
    expect(display).toBe('nothing to see here');
    expect(map.size).toBe(0);
    expect(displayTokensToContent('nothing to see here', map)).toBe('nothing to see here');
  });

  it('handles display names with regex-special characters', () => {
    const quirky: MemberInfo[] = [{ pubkey: 'a'.repeat(64), displayName: 'A.(B)+' }];
    const content = `hi ${serializeMention('a'.repeat(64))}`;
    const { display, map } = contentToDisplayTokens(content, quirky);
    expect(display).toBe('hi @A.(B)+');
    expect(displayTokensToContent(display, map)).toBe(content);
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
