import { describe, expect, it } from 'vitest';
import { profileHandle, profileName } from '@/utils/shell/panes/sidebar/sidebar-me';

const PK = 'a'.repeat(64);

describe('profileName', () => {
  it('prefers the display name, then the name, else null', () => {
    expect(profileName({ displayName: 'Ana', name: 'ana' })).toBe('Ana');
    expect(profileName({ displayName: '', name: 'ana' })).toBe('ana');
    expect(profileName({ displayName: null, name: null })).toBeNull();
    expect(profileName(null)).toBeNull();
  });
});

describe('profileHandle', () => {
  it('shows a NIP-05 without the root "_@", else a short npub', () => {
    expect(profileHandle({ nip05: '_@example.com' }, PK)).toBe('example.com');
    expect(profileHandle({ nip05: 'ana@example.com' }, PK)).toBe('ana@example.com');
    const npub = profileHandle(null, PK);
    expect(npub).toMatch(/^npub1/);
    expect(npub).not.toContain(PK.slice(0, 12));
  });
});
