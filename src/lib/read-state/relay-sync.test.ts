import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { v2 as nip44 } from 'nostr-tools/nip44';
import { finalizeEvent, type Event as NostrEvent } from 'nostr-tools';

// Default subscribeMock returns a no-op unsubscribe so cleanup never
// dereferences `undefined` even when a test forgets to set a real impl.
const subscribeMock = vi.fn(() => () => {});
const publishMock = vi.fn(async (_e: NostrEvent) => {});
const getNipSignerMock = vi.fn();

vi.mock('@/lib/nostr-bridge/client', () => ({
  getBridgeImpl: () => ({
    subscribeFilterWatched: subscribeMock,
    publishEvent: publishMock,
    getNipSigner: getNipSignerMock,
  }),
}));

import { wrapForSelf, type NipSigner } from '@/lib/nip-59';
import { startGroupsRelaySync, startDMRelaySync, D_TAG_GROUPS, __INTERNAL } from './relay-sync';
import { useReadStateStore, READ_STATE_INITIAL } from '@/store/read-state';

function nsecSigner(): NipSigner {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  return {
    pubkey,
    signEvent: async (t) => finalizeEvent({ ...t }, sk),
    nip44Encrypt: async (rcpt, pt) => {
      const key = nip44.utils.getConversationKey(sk, rcpt);
      return nip44.encrypt(pt, key);
    },
    nip44Decrypt: async (sndr, ct) => {
      const key = nip44.utils.getConversationKey(sk, sndr);
      return nip44.decrypt(ct, key);
    },
  };
}

describe('relay-sync internals', () => {
  it('parsePayload accepts v=1', () => {
    expect(__INTERNAL.parsePayload({
      kind: 30078, pubkey: '', tags: [], content: JSON.stringify({ v: 1, x: 1 }),
      created_at: 0, id: '',
    })).toEqual({ v: 1, x: 1 });
  });

  it('parsePayload rejects v != 1 (forward-incompat)', () => {
    expect(__INTERNAL.parsePayload({
      kind: 30078, pubkey: '', tags: [], content: JSON.stringify({ v: 2 }),
      created_at: 0, id: '',
    })).toBeNull();
  });

  it('parsePayload rejects malformed JSON', () => {
    expect(__INTERNAL.parsePayload({
      kind: 30078, pubkey: '', tags: [], content: 'not-json',
      created_at: 0, id: '',
    })).toBeNull();
  });

  it('findInnerDTag returns the d-tag value or null', () => {
    expect(__INTERNAL.findInnerDTag({
      kind: 30078, pubkey: '', tags: [['d', 'foo']], content: '',
      created_at: 0, id: '',
    })).toBe('foo');
    expect(__INTERNAL.findInnerDTag({
      kind: 30078, pubkey: '', tags: [], content: '', created_at: 0, id: '',
    })).toBeNull();
  });

  it('debounce is 8s — short enough to feel responsive while still coalescing reading bursts', () => {
    expect(__INTERNAL.DEBOUNCE_MS).toBe(8_000);
  });
});

describe('startGroupsRelaySync ingest', () => {
  let signer: NipSigner;
  let activeCleanups: Array<() => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear(); // bridgeCache lives here — wipe between tests
    useReadStateStore.setState({ ...READ_STATE_INITIAL });
    subscribeMock.mockReset();
    subscribeMock.mockImplementation(() => () => {});
    publishMock.mockReset();
    signer = nsecSigner();
    getNipSignerMock.mockReturnValue(signer);
    activeCleanups = [];
  });

  afterEach(() => {
    activeCleanups.forEach((c) => c());
    vi.useRealTimers();
  });

  it('subscribes to kind 1059 with #p=me on the target relay only', () => {
    const cleanup = startGroupsRelaySync('wss://relay.test', ['g1', 'g2']);
    activeCleanups.push(cleanup);
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    const [filter, , opts] = subscribeMock.mock.calls[0];
    expect(filter).toEqual({ kinds: [1059], '#p': [signer.pubkey] });
    expect(opts).toEqual({ relays: ['wss://relay.test'] });
  });

  it('applies an incoming wrap as max-merged group cursors (only ids in scope)', async () => {
    let onEvent: ((ev: NostrEvent) => void) | null = null;
    subscribeMock.mockImplementation((_f, cb) => {
      onEvent = cb;
      return () => {};
    });
    activeCleanups.push(startGroupsRelaySync('wss://relay.test', ['g1', 'g2']));
    expect(onEvent).not.toBeNull();

    const wrap = await wrapForSelf(
      {
        kind: 30078,
        tags: [['d', D_TAG_GROUPS]],
        content: JSON.stringify({
          v: 1,
          groups: {
            g1: { lastReadAt: 5000 },
            g2: { lastReadAt: 10_000 },
            g3: { lastReadAt: 99_999 }, // not in scope — must be dropped
          },
        }),
        created_at: Math.floor(Date.now() / 1000),
      },
      signer,
    );
    onEvent!(wrap);
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();

    const cursors = useReadStateStore.getState().groupCursors;
    expect(cursors['g1']).toBe(5000);
    expect(cursors['g2']).toBe(10_000);
    expect(cursors['g3']).toBeUndefined();
  });

  it('drops wraps whose inner d-tag does not match (e.g. DM-scope wraps)', async () => {
    let onEvent: ((ev: NostrEvent) => void) | null = null;
    subscribeMock.mockImplementation((_f, cb) => {
      onEvent = cb;
      return () => {};
    });
    activeCleanups.push(startGroupsRelaySync('wss://relay.test', ['g1']));

    const wrap = await wrapForSelf(
      {
        kind: 30078,
        tags: [['d', 'obelisk:dm-readstate:v1']], // wrong d-tag
        content: JSON.stringify({ v: 1, dms: {}, inboxLastReadAt: 0 }),
      },
      signer,
    );
    onEvent!(wrap);
    await Promise.resolve();
    await Promise.resolve();

    expect(useReadStateStore.getState().groupCursors).toEqual({});
  });
});

describe('startGroupsRelaySync publish (debounced)', () => {
  let signer: NipSigner;
  let activeCleanups: Array<() => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear(); // bridgeCache lives here — wipe between tests
    useReadStateStore.setState({ ...READ_STATE_INITIAL });
    subscribeMock.mockReset();
    subscribeMock.mockImplementation(() => () => {});
    publishMock.mockReset();
    signer = nsecSigner();
    getNipSignerMock.mockReturnValue(signer);
    activeCleanups = [];
  });

  afterEach(() => {
    activeCleanups.forEach((c) => c());
    vi.useRealTimers();
  });

  it('does not publish before the 8s window elapses', async () => {
    activeCleanups.push(startGroupsRelaySync('wss://relay.test', ['g1']));
    useReadStateStore.getState().setGroupCursor('g1', 100);
    useReadStateStore.getState().setGroupCursor('g1', 200);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('publishes once after 8s of changes, with mode=replace targeting the relay', async () => {
    activeCleanups.push(startGroupsRelaySync('wss://relay.test', ['g1', 'g2']));
    useReadStateStore.getState().setGroupCursor('g1', 100);
    useReadStateStore.getState().setGroupCursor('g2', 200);
    useReadStateStore.getState().setGroupCursor('g1', 150);
    await vi.advanceTimersByTimeAsync(8_000);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(publishMock).toHaveBeenCalledTimes(1);
    const [event, opts] = publishMock.mock.calls[0];
    expect(event.kind).toBe(1059);
    expect(opts).toEqual({ extraRelays: ['wss://relay.test'], mode: 'replace' });
  });

  it('skips publish when no in-scope cursor has advanced', async () => {
    activeCleanups.push(startGroupsRelaySync('wss://relay.test', ['g1']));
    // Out-of-scope group — should not trigger
    useReadStateStore.getState().setGroupCursor('g999', 100);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('cleanup eagerly flushes a pending publish so the wrap reaches the relay before unmount', async () => {
    const cleanup = startGroupsRelaySync('wss://relay.test', ['g1']);
    useReadStateStore.getState().setGroupCursor('g1', 100);
    // Half a debounce window — flush would normally still be pending.
    await vi.advanceTimersByTimeAsync(4_000);
    expect(publishMock).not.toHaveBeenCalled();
    cleanup();
    // Cleanup fires flushNow synchronously; let the async wrap+publish
    // resolve.
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(publishMock).toHaveBeenCalledTimes(1);
  });

  it('cleanup is a no-op when nothing has changed since the last publish', async () => {
    const cleanup = startGroupsRelaySync('wss://relay.test', ['g1']);
    useReadStateStore.getState().setGroupCursor('g1', 100);
    await vi.advanceTimersByTimeAsync(8_000);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(publishMock).toHaveBeenCalledTimes(1);
    publishMock.mockClear();
    cleanup();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    // No new cursor advance since the publish — cleanup must not republish.
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('visibilitychange to hidden flushes a pending publish', async () => {
    activeCleanups.push(startGroupsRelaySync('wss://relay.test', ['g1']));
    useReadStateStore.getState().setGroupCursor('g1', 100);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(publishMock).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(publishMock).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  it('pagehide flushes a pending publish', async () => {
    activeCleanups.push(startGroupsRelaySync('wss://relay.test', ['g1']));
    useReadStateStore.getState().setGroupCursor('g1', 100);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(publishMock).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('pagehide'));
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(publishMock).toHaveBeenCalledTimes(1);
  });
});

describe('startDMRelaySync', () => {
  let signer: NipSigner;
  let activeCleanups: Array<() => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear(); // bridgeCache lives here — wipe between tests
    useReadStateStore.setState({ ...READ_STATE_INITIAL });
    subscribeMock.mockReset();
    subscribeMock.mockImplementation(() => () => {});
    publishMock.mockReset();
    signer = nsecSigner();
    getNipSignerMock.mockReturnValue(signer);
    activeCleanups = [];
  });

  afterEach(() => {
    activeCleanups.forEach((c) => c());
    vi.useRealTimers();
  });

  it('returns a no-op cleanup when relays array is empty', () => {
    const cleanup = startDMRelaySync([]);
    expect(subscribeMock).not.toHaveBeenCalled();
    cleanup();
  });

  it('subscribes on each NIP-65 relay', () => {
    activeCleanups.push(startDMRelaySync(['wss://a.test', 'wss://b.test']));
    expect(subscribeMock).toHaveBeenCalledTimes(2);
    expect(subscribeMock.mock.calls[0][2]).toEqual({ relays: ['wss://a.test'] });
    expect(subscribeMock.mock.calls[1][2]).toEqual({ relays: ['wss://b.test'] });
  });

  it('publishes a DM-scope wrap to all NIP-65 relays after debounce', async () => {
    activeCleanups.push(startDMRelaySync(['wss://a.test', 'wss://b.test']));
    useReadStateStore.getState().setDmCursor('alice', 1000);
    await vi.advanceTimersByTimeAsync(8_000);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(publishMock).toHaveBeenCalledTimes(1);
    const [, opts] = publishMock.mock.calls[0];
    expect(opts.mode).toBe('replace');
    expect(opts.extraRelays).toEqual(['wss://a.test', 'wss://b.test']);
  });
});
