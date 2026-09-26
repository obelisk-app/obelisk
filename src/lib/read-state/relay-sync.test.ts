import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { v2 as nip44 } from 'nostr-tools/nip44';
import { finalizeEvent, type Event as NostrEvent } from 'nostr-tools';

// Default subscribeMock returns a no-op unsubscribe so cleanup never
// dereferences `undefined` even when a test forgets to set a real impl.
type SubFn = (
  filter: unknown,
  onEvent: (ev: NostrEvent) => void,
  options?: { relays?: readonly string[] },
) => () => void;
const subscribeMock = vi.fn<SubFn>(() => () => {});
const publishMock = vi.fn(
  async (
    _e: NostrEvent,
    _opts?: { extraRelays?: readonly string[]; mode?: 'replace' | 'append'; quiet?: boolean },
  ) => {},
);
const publishSignedMock = vi.fn(
  async (
    _e: NostrEvent,
    _relays: string[],
    _opts?: { quiet?: boolean; authMode?: string },
  ) => {},
);
const getNipSignerMock = vi.fn();

vi.mock('@/lib/nostr-bridge/client', () => ({
  getBridgeImpl: () => ({
    subscribeFilterWatched: subscribeMock,
    publishEvent: publishMock,
    publishSignedEvent: publishSignedMock,
    getNipSigner: getNipSignerMock,
  }),
}));

import { wrapForSelf, type NipSigner } from '@/lib/nip-59';
import { startGroupsRelaySync, startDMRelaySync, D_TAG_GROUPS, READ_STATE_WATCHDOG_MS, __INTERNAL } from './relay-sync';
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
    publishSignedMock.mockReset();
    signer = nsecSigner();
    getNipSignerMock.mockReturnValue(signer);
    activeCleanups = [];
  });

  afterEach(() => {
    activeCleanups.forEach((c) => c());
    vi.useRealTimers();
  });

  it('subscribes to its own 30078, plus legacy wraps during migration', () => {
    const cleanup = startGroupsRelaySync('wss://relay.test', ['g1', 'g2']);
    activeCleanups.push(cleanup);
    // Two subs while migrating: the new addressable event, and the old wrap
    // stream so cursors written by a previous client are not stranded.
    expect(subscribeMock).toHaveBeenCalledTimes(2);

    const [newFilter, , newOpts] = subscribeMock.mock.calls[0];
    // Narrow by author + d: one event back, one decrypt. The wrap filter below
    // can only match on #p and so receives every DM wrap addressed to us.
    expect(newFilter).toEqual({
      kinds: [30078],
      authors: [signer.pubkey],
      '#d': [D_TAG_GROUPS],
    });
    expect(newOpts).toEqual({ relays: ['wss://relay.test'], watchdogMs: READ_STATE_WATCHDOG_MS });

    const [legacyFilter] = subscribeMock.mock.calls[1];
    expect(legacyFilter).toEqual({ kinds: [1059], '#p': [signer.pubkey] });
  });

  it('gives the sub far longer than the default watchdog to answer', () => {
    // This REQ cannot be narrowed (ephemeral outer key, fuzzed created_at, the
    // cursor wrap buried among DM wraps), so on a loaded relay it can take tens
    // of seconds. Under the 5s default the watchdog tore it down and retried,
    // each retry re-running the same scan — cursors never landed and every
    // channel painted unread.
    activeCleanups.push(startGroupsRelaySync('wss://relay.test', ['g1']));
    const opts = subscribeMock.mock.calls[0][2] as { watchdogMs?: number };
    expect(opts.watchdogMs).toBeGreaterThanOrEqual(30_000);
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

  /** Route each captured subscription by the kind it asked for. */
  function captureByKind() {
    const handlers: Record<number, (ev: NostrEvent) => void> = {};
    subscribeMock.mockImplementation((f, cb) => {
      const kind = (f as { kinds: number[] }).kinds[0];
      handlers[kind] = cb;
      return () => {};
    });
    return handlers;
  }

  async function settle() {
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
  }

  it('ingests a replaceable 30078 and merges its cursors', async () => {
    const handlers = captureByKind();
    activeCleanups.push(startGroupsRelaySync('wss://relay.test', ['g1', 'g2']));

    const content = await signer.nip44Encrypt(
      signer.pubkey,
      JSON.stringify({
        v: 1,
        groups: {
          g1: { lastReadAt: 7000 },
          g3: { lastReadAt: 1 }, // out of scope
        },
      }),
    );
    handlers[30078]!(finalizeEvent({
      kind: 30078,
      tags: [['d', D_TAG_GROUPS]],
      content,
      created_at: Math.floor(Date.now() / 1000),
    }, generateSecretKey()) as NostrEvent);
    await settle();

    const cursors = useReadStateStore.getState().groupCursors;
    expect(cursors['g1']).toBe(7000);
    expect(cursors['g3']).toBeUndefined();
  });

  it('a 30078 written after a legacy wrap wins, and vice versa', async () => {
    const handlers = captureByKind();
    activeCleanups.push(startGroupsRelaySync('wss://relay.test', ['g1']));
    const base = Math.floor(Date.now() / 1000);

    // Older legacy wrap first.
    handlers[1059]!(await wrapForSelf({
      kind: 30078,
      tags: [['d', D_TAG_GROUPS]],
      content: JSON.stringify({ v: 1, groups: { g1: { lastReadAt: 100 } } }),
      created_at: base - 60,
    }, signer));
    await settle();
    expect(useReadStateStore.getState().groupCursors['g1']).toBe(100);

    // Newer 30078 supersedes it.
    handlers[30078]!(finalizeEvent({
      kind: 30078,
      tags: [['d', D_TAG_GROUPS]],
      content: await signer.nip44Encrypt(
        signer.pubkey,
        JSON.stringify({ v: 1, groups: { g1: { lastReadAt: 900 } } }),
      ),
      created_at: base,
    }, generateSecretKey()) as NostrEvent);
    await settle();
    expect(useReadStateStore.getState().groupCursors['g1']).toBe(900);

    // A legacy wrap that is OLDER than what we already applied must not
    // resurrect a stale cursor. Cursors are monotonic, so the store keeps the
    // max regardless — assert the merged result, not just the last write.
    handlers[1059]!(await wrapForSelf({
      kind: 30078,
      tags: [['d', D_TAG_GROUPS]],
      content: JSON.stringify({ v: 1, groups: { g1: { lastReadAt: 50 } } }),
      created_at: base - 120,
    }, signer));
    await settle();
    expect(useReadStateStore.getState().groupCursors['g1']).toBe(900);
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

  it('publishes once after 8s as a replaceable 30078, not a gift wrap', async () => {
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
    // 30078 addressed by `d` — the relay keeps one per (pubkey, kind, d), so
    // cursor advances replace rather than accumulate.
    expect(event.kind).toBe(30078);
    expect(event.tags).toEqual([['d', D_TAG_GROUPS]]);
    // `quiet`: this flush fires on every channel open, and logging it put a
    // "Publishing to relays · kind 30078" toast on every screen.
    expect(opts).toEqual({ extraRelays: ['wss://relay.test'], mode: 'replace', quiet: true });
    // Payload is encrypted to self: the relay stores an opaque blob.
    expect(event.content).not.toContain('g1');
    expect(() => JSON.parse(event.content)).toThrow();
    // Groups scope must not emit wraps any more.
    expect(publishSignedMock).not.toHaveBeenCalled();
  });

  it('the published 30078 decrypts back to the cursors', async () => {
    activeCleanups.push(startGroupsRelaySync('wss://relay.test', ['g1']));
    useReadStateStore.getState().setGroupCursor('g1', 4242);
    await vi.advanceTimersByTimeAsync(8_000);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const [event] = publishMock.mock.calls[0];
    const plain = JSON.parse(await signer.nip44Decrypt(signer.pubkey, event.content));
    expect(plain.v).toBe(1);
    expect(plain.groups.g1.lastReadAt).toBe(4242);
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
    expect(subscribeMock.mock.calls[0][2]).toEqual({ relays: ['wss://a.test'], watchdogMs: READ_STATE_WATCHDOG_MS });
    expect(subscribeMock.mock.calls[1][2]).toEqual({ relays: ['wss://b.test'], watchdogMs: READ_STATE_WATCHDOG_MS });
  });

  it('publishes a DM-scope wrap pre-signed, preserving the ephemeral author', async () => {
    activeCleanups.push(startDMRelaySync(['wss://a.test', 'wss://b.test']));
    useReadStateStore.getState().setDmCursor('alice', 1000);
    await vi.advanceTimersByTimeAsync(8_000);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Must go through publishSignedEvent. publishEvent re-signs its template,
    // which would swap the throwaway wrap author for the user's own key and
    // leave the payload undecryptable.
    expect(publishSignedMock).toHaveBeenCalledTimes(1);
    expect(publishMock).not.toHaveBeenCalled();

    const [event, relays, opts] = publishSignedMock.mock.calls[0];
    expect(event.kind).toBe(1059);
    expect(event.pubkey).not.toBe(signer.pubkey);
    expect(relays).toEqual(['wss://a.test', 'wss://b.test']);
    expect(opts!.authMode).toBe('last-resort');
  });
});
