import { afterEach, describe, expect, it, vi } from 'vitest';
import * as crypto from '@/lib/crypto/session-vault';
import * as vault from '@/services/nostr-bridge/session/vault';
import { SessionPersistence } from '@/services/nostr-bridge/session/persistence';
import { SessionState } from '@/services/nostr-bridge/session/state';
import { STORAGE_KEY } from '@/constants/nostr-bridge/session';

afterEach(() => vi.restoreAllMocks());

describe('vault restore ownership', () => {
  it.each(['resolve', 'reject'] as const)('keeps the newer account record when an older vault open will %s', async (outcome) => {
    let resolve!: (value: { privKeyHex: string }) => void;
    let reject!: (error: Error) => void;
    const opened = new Promise<{ privKeyHex: string }>((done, fail) => { resolve = done; reject = fail; });
    vi.spyOn(crypto, 'isVaultAvailable').mockReturnValue(true);
    vi.spyOn(vault, 'openSessionSecrets').mockReturnValue(opened);
    const state = new SessionState();
    const store = new SessionPersistence(state);
    const generation = state.beginSessionOperation();
    const older = store.load(JSON.stringify({ v: 2, pubKeyHex: 'a'.repeat(64), loginMethod: 'nsec', relayUrl: 'wss://relay.example.com', sealed: { v: 1, iv: 'iv', ct: 'ct' } }), () => generation === state.sessionGeneration);
    state.beginSessionOperation();
    state.session = { pubKeyHex: 'b'.repeat(64), loginMethod: 'nip07', relayUrl: 'wss://relay.example.com' };
    store.persist();
    const currentRecord = localStorage.getItem(STORAGE_KEY);
    if (outcome === 'resolve') resolve({ privKeyHex: '1'.repeat(64) });
    else reject(new crypto.VaultError('key-missing'));
    expect(await older).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(currentRecord);
    expect(state.sessionNotice.get()).toBeNull();
  });
});
