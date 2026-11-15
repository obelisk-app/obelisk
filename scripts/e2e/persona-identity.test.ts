import { expect, it } from 'vitest';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { createTestPersonas, loadPersonaIdentity } from './persona-identity';

it('creates independent fresh accounts for each test run', () => {
  const first = createTestPersonas();
  const second = createTestPersonas();
  expect(new Set([first.owner.pkHex, first.member.pkHex, second.owner.pkHex, second.member.pkHex]).size).toBe(4);
  expect(loadPersonaIdentity('CAPITAN_MATE', {
    OBELISK_E2E_CAPITAN_MATE_NSEC: first.owner.nsec,
    OBELISK_E2E_CAPITAN_MATE_NPUB: first.owner.npub,
  }).pkHex).toBe(first.owner.pkHex);
});

it('requires an independently configured matching public identity', () => {
  const sk = generateSecretKey();
  const nsec = nip19.nsecEncode(sk);
  const npub = nip19.npubEncode(getPublicKey(sk));
  const env = { OBELISK_E2E_CAPITAN_MATE_NSEC: nsec, OBELISK_E2E_CAPITAN_MATE_NPUB: npub };
  expect(loadPersonaIdentity('CAPITAN_MATE', env).pkHex).toBe(getPublicKey(sk));
  expect(() => loadPersonaIdentity('MILO_ALFAJOR', env)).toThrow('Missing E2E credentials');
  const mismatched = { ...env, OBELISK_E2E_CAPITAN_MATE_NPUB: nip19.npubEncode(getPublicKey(generateSecretKey())) };
  expect(() => loadPersonaIdentity('CAPITAN_MATE', mismatched)).toThrow('Invalid or mismatched');
});

it('does not include secret input in failures', () => {
  const secret = 'invalid-secret-input';
  try {
    loadPersonaIdentity('MILO_ALFAJOR', { OBELISK_E2E_MILO_ALFAJOR_NSEC: secret, OBELISK_E2E_MILO_ALFAJOR_NPUB: 'invalid' });
    throw new Error('Expected validation failure');
  } catch (error) {
    expect(String(error)).not.toContain(secret);
    expect(String(error)).toContain('Invalid or mismatched');
  }
});
