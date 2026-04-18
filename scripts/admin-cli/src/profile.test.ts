import { describe, it, expect } from 'vitest';
import { verifyEvent } from 'nostr-tools/pure';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { buildProfileMetadata, buildProfileEvent } from './profile';

describe('buildProfileMetadata', () => {
  it('returns patch fields when no existing profile', () => {
    expect(buildProfileMetadata(null, { name: 'Archon', picture: 'https://x/a.gif' }))
      .toEqual({ name: 'Archon', picture: 'https://x/a.gif' });
  });

  it('merges patch into existing profile, preserving untouched fields', () => {
    const existing = { name: 'Archon', about: 'Guardian', nip05: 'a@b.c' };
    const patch = { picture: 'https://x/new.gif', about: 'New bio' };
    expect(buildProfileMetadata(existing, patch)).toEqual({
      name: 'Archon', about: 'New bio', nip05: 'a@b.c', picture: 'https://x/new.gif',
    });
  });

  it('empty-string value removes a field (explicit clear)', () => {
    const existing = { name: 'Archon', nip05: 'old@host' };
    expect(buildProfileMetadata(existing, { nip05: '' })).toEqual({ name: 'Archon' });
  });

  it('undefined in patch is ignored (no change)', () => {
    const existing = { name: 'Archon' };
    expect(buildProfileMetadata(existing, { picture: undefined })).toEqual({ name: 'Archon' });
  });
});

describe('buildProfileEvent', () => {
  it('produces a signed kind-0 event with JSON content', () => {
    const secret = generateSecretKey();
    const pubkey = getPublicKey(secret);
    const ev = buildProfileEvent(secret, { name: 'Archon', picture: 'https://x/a.gif' });
    expect(ev.kind).toBe(0);
    expect(ev.pubkey).toBe(pubkey);
    expect(verifyEvent(ev)).toBe(true);
    expect(JSON.parse(ev.content)).toEqual({ name: 'Archon', picture: 'https://x/a.gif' });
  });
});
