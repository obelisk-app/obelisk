import { beforeEach, describe, expect, it } from 'vitest';
import {
  parseStoredSession,
  readMigrated,
  secretsOf,
  storedRecordFor,
} from '@/services/nostr-bridge/session/session-storage';
import { LEGACY_RELAYS_KEY, LEGACY_STORAGE_KEY, RELAYS_KEY, STORAGE_KEY } from '@/constants/nostr-bridge/session';

describe('readMigrated', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns the current key when present and leaves the legacy key alone', () => {
    window.localStorage.setItem(STORAGE_KEY, 'new');
    window.localStorage.setItem(LEGACY_STORAGE_KEY, 'old');
    expect(readMigrated(STORAGE_KEY, LEGACY_STORAGE_KEY)).toBe('new');
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toBe('old');
  });

  it('migrates a legacy value once: copies it under the new key and deletes the old one', () => {
    window.localStorage.setItem(LEGACY_RELAYS_KEY, '["wss://a"]');
    expect(readMigrated(RELAYS_KEY, LEGACY_RELAYS_KEY)).toBe('["wss://a"]');
    expect(window.localStorage.getItem(RELAYS_KEY)).toBe('["wss://a"]');
    expect(window.localStorage.getItem(LEGACY_RELAYS_KEY)).toBeNull();
  });

  it('returns null when neither key exists', () => {
    expect(readMigrated(STORAGE_KEY, LEGACY_STORAGE_KEY)).toBeNull();
  });

  it('keys are the obelisk-dex namespace with obeliskord legacy twins', () => {
    expect(STORAGE_KEY).toBe('obelisk-dex/session');
    expect(RELAYS_KEY).toBe('obelisk-dex/relays');
    expect(LEGACY_STORAGE_KEY).toBe('obeliskord/session');
    expect(LEGACY_RELAYS_KEY).toBe('obeliskord/relays');
  });
});

describe('the stored session record (v2)', () => {
  const box = { v: 1 as const, iv: 'aXZpdml2aXZpdml2', ct: 'Y3Q' };
  const nsec = { privKeyHex: 'f'.repeat(64), pubKeyHex: 'a'.repeat(64), loginMethod: 'nsec' as const, relayUrl: 'wss://r' };

  it('keeps the public half in the clear and the secrets only as the sealed box', () => {
    const record = storedRecordFor(nsec, box);
    expect(record).toEqual({ v: 2, pubKeyHex: nsec.pubKeyHex, loginMethod: 'nsec', relayUrl: 'wss://r', sealed: box });
    expect(JSON.stringify(record)).not.toContain(nsec.privKeyHex);
  });

  it('refuses to build a record for a session with secrets but no box', () => {
    expect(() => storedRecordFor(nsec, null)).toThrow(/no sealed box/);
    const bunker = { pubKeyHex: 'a'.repeat(64), loginMethod: 'bunker' as const, relayUrl: 'wss://r', bunkerUrl: 'bunker://x?secret=s', bunkerLocalSecretHex: 'e'.repeat(64) };
    expect(() => storedRecordFor(bunker, null)).toThrow(/no sealed box/);
  });

  it('a NIP-07 record has nothing to seal', () => {
    const record = storedRecordFor({ pubKeyHex: 'a'.repeat(64), loginMethod: 'nip07', relayUrl: 'wss://r' }, null);
    expect(record).not.toHaveProperty('sealed');
  });

  it('secretsOf takes exactly the three secret fields that are present', () => {
    expect(secretsOf(nsec)).toEqual({ privKeyHex: nsec.privKeyHex });
  });

  it('parses both shapes and rejects anything else', () => {
    expect(parseStoredSession(JSON.stringify(storedRecordFor(nsec, box))).kind).toBe('sealed');
    expect(parseStoredSession(JSON.stringify(nsec))).toEqual({ kind: 'plaintext', session: nsec });
    expect(() => parseStoredSession('not json')).toThrow();
    expect(() => parseStoredSession('[]')).toThrow();
    expect(() => parseStoredSession(JSON.stringify({ v: 2, pubKeyHex: 'a', loginMethod: 'nsec', relayUrl: 'wss://r' }))).toThrow(/no sealed box/);
    expect(() => parseStoredSession(JSON.stringify({ pubKeyHex: 'a', loginMethod: 'password', relayUrl: 'wss://r' }))).toThrow();
  });
});
