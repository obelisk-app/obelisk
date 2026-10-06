import { beforeEach, describe, expect, it } from 'vitest';
import { LEGACY_RELAYS_KEY, LEGACY_STORAGE_KEY, RELAYS_KEY, STORAGE_KEY, readMigrated } from '@/services/nostr-bridge/session-storage';

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
