import { describe, expect, it } from 'vitest';
import { ADJECTIVES, NOUNS, avatarInitials, displayNameFor, petnameFor } from './display-name';

const PK = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

describe('petnameFor', () => {
  it('is stable for a pubkey', () => {
    // The whole point: a name that changed per render is worse than hex.
    expect(petnameFor(PK)).toBe(petnameFor(PK));
  });

  it('does not depend on the case the caller happened to have', () => {
    expect(petnameFor(PK.toUpperCase())).toBe(petnameFor(PK));
  });

  it('gives different keys different names', () => {
    expect(petnameFor(PK)).not.toBe(petnameFor(OTHER));
  });

  it('reads as a name, not an identifier', () => {
    const [adjective, noun] = petnameFor(PK).split(' ');
    expect(ADJECTIVES).toContain(adjective);
    expect(NOUNS).toContain(noun);
  });

  it('spreads across the vocabulary rather than clustering', () => {
    // A hash that marched both words together would yield a handful of
    // pairs for thousands of keys.
    const names = new Set<string>();
    for (let i = 0; i < 2000; i += 1) names.add(petnameFor(i.toString(16).padStart(64, '0')));
    expect(names.size).toBeGreaterThan(500);
  });
});

describe('displayNameFor', () => {
  it('prefers what someone calls themselves', () => {
    expect(displayNameFor(PK, { displayName: 'Fabricio', name: 'fabri' })).toBe('Fabricio');
  });

  it('falls back to name', () => {
    expect(displayNameFor(PK, { name: 'fabri' })).toBe('fabri');
  });

  it('treats a blank field as absent — relays carry plenty of them', () => {
    expect(displayNameFor(PK, { displayName: '   ', name: '' })).toBe(petnameFor(PK));
  });

  it('uses the nip05 local part before inventing a name', () => {
    expect(displayNameFor(PK, { nip05: 'alice@example.com' })).toBe('alice');
  });

  it('ignores a bare _@domain, which names the domain and not the person', () => {
    expect(displayNameFor(PK, { nip05: '_@example.com' })).toBe(petnameFor(PK));
  });

  it('gives a petname when nothing is known', () => {
    // Never `6ad13026e1`, and never a fake bech32.
    const name = displayNameFor(PK, null);
    expect(name).toBe(petnameFor(PK));
    expect(name).not.toMatch(/^[0-9a-f]{8}/);
    expect(name).not.toMatch(/^npub/);
  });

  it('handles undefined metadata', () => {
    expect(displayNameFor(PK)).toBe(petnameFor(PK));
  });
});

describe('avatarInitials', () => {
  it('takes one letter from each of two words', () => {
    expect(avatarInitials('Fabricio Acosta', PK)).toBe('FA');
  });

  it('takes two letters from a single word', () => {
    expect(avatarInitials('satoshi', PK)).toBe('SA');
  });

  it('never derives letters from hex', () => {
    // The member list used to render `6A` from a pubkey slice.
    const initials = avatarInitials(null, PK);
    const [adjective, noun] = petnameFor(PK).split(' ');
    expect(initials).toBe((adjective[0] + noun[0]).toUpperCase());
  });

  it('falls back rather than rendering an empty circle', () => {
    expect(avatarInitials('   ', PK)).toBe(avatarInitials(null, PK));
  });
});
