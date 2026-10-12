import { describe, expect, it } from 'vitest';
import { avatarInitials, displayNameFor, randomProfileName } from '@/utils/identity/display-name';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { ADJECTIVES, NOUNS } from '@/constants/identity/display-name';

const PK = 'a'.repeat(64);
const LABEL = shortNpubLabel(PK);


describe('displayNameFor', () => {
  it('prefers what someone calls themselves', () => {
    expect(displayNameFor(PK, { displayName: 'Fabricio', name: 'fabri' })).toBe('Fabricio');
  });

  it('falls back to name', () => {
    expect(displayNameFor(PK, { name: 'fabri' })).toBe('fabri');
  });

  it('treats a blank field as absent: relays carry plenty of them', () => {
    expect(displayNameFor(PK, { displayName: '   ', name: '' })).toBe(LABEL);
  });

  it('uses the public key when only a NIP-05 address is known', () => {
    expect(displayNameFor(PK, { nip05: 'alice@example.com' })).toBe(LABEL);
  });

  it('ignores a bare _@domain, which names the domain and not the person', () => {
    expect(displayNameFor(PK, { nip05: '_@example.com' })).toBe(LABEL);
  });

  it('shows the shortened public key when no profile is known', () => {
    expect(displayNameFor(PK, null)).toBe(LABEL);
    expect(displayNameFor(PK, null)).toMatch(/^npub1/);
  });

  it('handles undefined metadata', () => {
    expect(displayNameFor(PK)).toBe(LABEL);
  });
});

describe('avatarInitials', () => {
  it('takes one letter from each of two words', () => {
    expect(avatarInitials('Fabricio Acosta', PK)).toBe('FA');
  });

  it('takes two letters from a single word', () => {
    expect(avatarInitials('satoshi', PK)).toBe('SA');
  });

  it('uses key characters when there is no name, including a fallback label', () => {
    expect(avatarInitials(null, PK)).toBe('AA');
    expect(avatarInitials(LABEL, PK)).toBe('AA');
  });

  it('falls back rather than rendering an empty circle', () => {
    expect(avatarInitials('   ', PK)).toBe(avatarInitials(null, PK));
  });
});

describe('randomProfileName', () => {
  it('draws an adjective and a noun from the suggested-name vocabulary', () => {
    expect(randomProfileName(() => 0)).toBe('Brave Badger');
    const [adjective, noun] = randomProfileName(() => 0.999).split(' ');
    expect(ADJECTIVES).toContain(adjective);
    expect(NOUNS).toContain(noun);
  });
});
