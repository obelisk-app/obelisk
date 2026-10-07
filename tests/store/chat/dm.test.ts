import { describe, it, expect, beforeEach } from 'vitest';
import { useDMStore, ensureDMStoreForAccount, DM_STORE_VERSION } from '@/store/chat/dm';
import type { DMMessage } from '@/store/chat/dm';
import { freshPubkey, readBlob, seedBlob } from '../persist-blob';

const makeMsg = (overrides: Partial<DMMessage> = {}): DMMessage => ({
  id: '1',
  senderPubkey: 'a',
  recipientPubkey: 'b',
  content: 'hi',
  createdAt: 0,
  protocol: 'nip17',
  ...overrides,
});

describe('useDMStore', () => {
  beforeEach(() => {
    useDMStore.setState({
      isDMMode: false,
      activeDMPubkey: null,
      threads: [],
      messages: [],
      isLoadingMessages: false,
      isLoadingThreads: false,
      hasMoreHistory: false,
      protocolOverrides: {},
      showProtocolPrompt: null,
    });
  });

  it('has correct initial state', () => {
    const state = useDMStore.getState();
    expect(state.isDMMode).toBe(false);
    expect(state.activeDMPubkey).toBeNull();
    expect(state.threads).toEqual([]);
    expect(state.messages).toEqual([]);
    expect(state.hasMoreHistory).toBe(false);
  });

  it('sets protocol override and clears prompt', () => {
    useDMStore.setState({ showProtocolPrompt: 'pk1' });
    useDMStore.getState().setProtocolOverride('pk1', 'nip04');
    expect(useDMStore.getState().protocolOverrides['pk1']).toBe('nip04');
    expect(useDMStore.getState().showProtocolPrompt).toBeNull();
  });
});

describe('per-account DM store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // The ensure is a module-level no-op for the account it already points
  // at, so every test below uses pubkeys no other test in this file uses.
  const stored = (pubkey: string) =>
    (JSON.parse(localStorage.getItem(`obelisk-dm-store:${pubkey}`) ?? 'null') as
      { state: { protocolOverrides: Record<string, string> } } | null)?.state;
  const overrides = () => useDMStore.getState().protocolOverrides;

  // Storage is synchronous, so no tick is awaited anywhere here: the factory
  // relies on `rehydrate()` settling before it returns.
  it('persist key includes the active pubkey', () => {
    const A = 'a'.repeat(64);
    ensureDMStoreForAccount(A);
    useDMStore.getState().setProtocolOverride('b'.repeat(64), 'nip04');
    expect(stored(A)?.protocolOverrides).toEqual({ ['b'.repeat(64)]: 'nip04' });
  });

  it('a second account starts from the initial state, and the first account survives the round trip', () => {
    const A = 'e'.repeat(64);
    const B = 'f'.repeat(64);
    const peer = 'p'.repeat(64);

    ensureDMStoreForAccount(A);
    useDMStore.getState().setProtocolOverride(peer, 'nip04');
    expect(stored(A)?.protocolOverrides).toEqual({ [peer]: 'nip04' });

    // B has nothing stored and must not inherit A's per-peer choices. Note
    // this store's own `merge` (the legacy-plaintext guard) already rebuilt
    // `protocolOverrides` from storage alone, so it never leaked in memory
    // the way the other stores did; this pins that down either way.
    ensureDMStoreForAccount(B);
    expect(overrides()).toEqual({});
    expect(stored(A)?.protocolOverrides).toEqual({ [peer]: 'nip04' });

    useDMStore.getState().setProtocolOverride(peer, 'nip17');
    expect(stored(B)?.protocolOverrides).toEqual({ [peer]: 'nip17' });
    expect(stored(A)?.protocolOverrides).toEqual({ [peer]: 'nip04' });

    ensureDMStoreForAccount(A);
    expect(overrides()).toEqual({ [peer]: 'nip04' });
  });

  it('detaching (logout) resets memory and stops writes reaching the account key', () => {
    const A = 'g'.repeat(64);
    const peer = 'p'.repeat(64);
    ensureDMStoreForAccount(A);
    useDMStore.getState().setProtocolOverride(peer, 'nip04');

    ensureDMStoreForAccount(null);
    expect(overrides()).toEqual({});
    useDMStore.getState().setProtocolOverride('q'.repeat(64), 'nip17');
    expect(stored(A)?.protocolOverrides).toEqual({ [peer]: 'nip04' });
    // Detached writes go to the unscoped legacy key, not to any account.
    const unscoped = JSON.parse(localStorage.getItem('obelisk-dm-store') ?? 'null') as
      { state: { protocolOverrides: Record<string, string> } } | null;
    expect(unscoped?.state.protocolOverrides).toEqual({ ['q'.repeat(64)]: 'nip17' });
  });

  it('messages field is excluded from persisted state', () => {
    ensureDMStoreForAccount('a'.repeat(64));
    useDMStore.setState({ messages: [makeMsg({ content: 'plain-text-payload' })] });
    useDMStore.getState().setProtocolOverride('b'.repeat(64), 'nip04');
    const persisted = localStorage.getItem('obelisk-dm-store:' + 'a'.repeat(64)) ?? '';
    expect(persisted).not.toContain('plain-text-payload');
  });

  it('does not rehydrate plaintext left by an older app version', async () => {
    const pubkey = 'c'.repeat(64);
    localStorage.setItem(`obelisk-dm-store:${pubkey}`, JSON.stringify({
      state: {
        protocolOverrides: { ['d'.repeat(64)]: 'nip04' },
        threads: [{ pubkey: 'old-peer', lastMessage: 'old preview' }],
        messages: [makeMsg({ content: 'old decrypted message' })],
      },
      version: 0,
    }));

    ensureDMStoreForAccount(pubkey);
    await useDMStore.persist.rehydrate();

    expect(useDMStore.getState().threads).toEqual([]);
    expect(useDMStore.getState().messages).toEqual([]);
    expect(useDMStore.getState().protocolOverrides['d'.repeat(64)]).toBe('nip04');
  });
});

describe('DM store saved-data migrations', () => {
  beforeEach(() => localStorage.clear());

  // Unique pubkeys: the per-account ensure is a no-op for the account it already points at.
  const key = (pk: string) => `obelisk-dm-store:${pk}`;

  it('a version 0 blob keeps its protocol choices and is rewritten without the old plaintext', () => {
    const pk = '1'.repeat(64);
    const peer = 'd'.repeat(64);
    seedBlob(key(pk), {
      protocolOverrides: { [peer]: 'nip04' },
      threads: [{ pubkey: peer, displayName: 'Old', lastMessage: 'old preview' }],
      messages: [makeMsg({ content: 'old decrypted message' })],
      isDMMode: true,
    }, 0);

    ensureDMStoreForAccount(pk);

    expect(useDMStore.getState().protocolOverrides).toEqual({ [peer]: 'nip04' });
    expect(useDMStore.getState().messages).toEqual([]);
    expect(useDMStore.getState().isDMMode).toBe(false);
    const saved = readBlob(key(pk));
    expect(saved?.version).toBe(DM_STORE_VERSION);
    expect(saved?.state).toEqual({ protocolOverrides: { [peer]: 'nip04' } });
    expect(localStorage.getItem(key(pk))).not.toContain('old decrypted message');
  });

  it('drops protocol values it does not know and keeps the valid ones', () => {
    const pk = '2'.repeat(64);
    seedBlob(key(pk), { protocolOverrides: { good: 'nip17', bad: 'nip99', worse: 4 } }, 0);
    ensureDMStoreForAccount(pk);
    expect(useDMStore.getState().protocolOverrides).toEqual({ good: 'nip17' });
  });

  it.each([
    ['a string instead of state', 'garbage', 0],
    ['an array instead of state', [1, 2, 3], 0],
    ['null state', null, DM_STORE_VERSION],
    ['overrides of the wrong type', { protocolOverrides: 'nip04' }, DM_STORE_VERSION],
    ['a version from a newer build', { protocolOverrides: { x: 'nip04' } }, 99],
    ['a negative version', { protocolOverrides: { x: 'nip04' } }, -1],
  ])('falls back to the defaults on %s', (_label, state, version) => {
    const pk = freshPubkey();
    seedBlob(key(pk), state, version);
    expect(() => ensureDMStoreForAccount(pk)).not.toThrow();
    expect(useDMStore.getState().protocolOverrides).toEqual({});
  });

  it('unparseable JSON falls back to the defaults', () => {
    const pk = '4'.repeat(64);
    localStorage.setItem(key(pk), '{"state": {"protocolOverrides":');
    expect(() => ensureDMStoreForAccount(pk)).not.toThrow();
    expect(useDMStore.getState().protocolOverrides).toEqual({});
  });
});
