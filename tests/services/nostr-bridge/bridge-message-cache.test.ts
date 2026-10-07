/**
 * Channel history beyond the live stream on the pool-level fake: the message and reaction cache (cap, placeholders, seeding, hidden channels, logout) and paging older history.
 *
 * Mocks `SimplePool` from `nostr-tools` (`./support/bridge-fake-pool.ts`)
 * to capture published events and deliver them back to subscribers, a relay
 * round trip without the network. Real crypto runs end to end. Split out of
 * the one 4,900-line suite along the bridge's module seams (round 16); the
 * shared lifecycle and helpers are `./support/bridge-harness.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent, type Event as NostrEvent } from 'nostr-tools';
import {
  deliver,
  fakeRelayMessage,
  fakeRelayMetadata,
  flush,
  installBridgeHarness,
  makeKeypair,
} from '@tests/services/nostr-bridge/support/bridge-harness';

const fake = await vi.hoisted(async () => (await import('@tests/services/nostr-bridge/support/bridge-fake-pool')).createFakeBridgePool());

vi.mock('nostr-tools', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, SimplePool: fake.FakePool };
});

installBridgeHarness(fake);

describe('nostr-bridge', () => {

  it('cached messages cap at MESSAGE_CACHE_LIMIT (last 50 by createdAt)', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { cacheGet } = await import('@/services/nostr-bridge/cache/cache');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'msg-cache-cap';
    bridge.subscribeMessages(groupId, () => {});
    await flush();

    // Pre-sign 60 events with increasing created_at so the ordering is stable.
    const events: NostrEvent[] = [];
    const baseTs = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 60; i++) {
      const sk = generateSecretKey();
      const pk = getPublicKey(sk);
      events.push(
        finalizeEvent(
          {
            kind: 9,
            content: `m${i}`,
            tags: [['h', groupId]],
            created_at: baseTs + i,
            pubkey: pk,
          } as Parameters<typeof finalizeEvent>[0],
          sk,
        ),
      );
    }

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      for (const ev of events) deliver(ev);
      await vi.advanceTimersByTimeAsync(300);
    } finally {
      vi.useRealTimers();
    }
    await flush();

    const cached = cacheGet<{ content: string }[]>(
      impl.currentRelayUrl.get(),
      9,
      groupId,
    );
    expect(cached).toBeTruthy();
    expect(cached!.value).toHaveLength(50);
    // Newest-by-createdAt window: m10..m59. The first 10 are dropped.
    expect(cached!.value[0].content).toBe('m10');
    expect(cached!.value[49].content).toBe('m59');
  });


  it('optimistic placeholders are filtered out before the cache write', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { cacheGet } = await import('@/services/nostr-bridge/cache/cache');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'msg-cache-no-optimistic';
    bridge.subscribeMessages(groupId, () => {});
    await flush();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // bridge.sendMessage inserts an optimistic placeholder synchronously,
      // then publishes, then the relay echo replaces it. Drive the full
      // round-trip so the cache flush sees only the confirmed copy.
      await bridge.sendMessage(groupId, 'sent-via-bridge');
      await vi.advanceTimersByTimeAsync(300);
    } finally {
      vi.useRealTimers();
    }
    await flush();

    const cached = cacheGet<{ content: string; pending?: boolean }[]>(
      impl.currentRelayUrl.get(),
      9,
      groupId,
    );
    expect(cached).toBeTruthy();
    expect(cached!.value).toHaveLength(1);
    // No leftover `pending: true` on a cached entry, that would resurrect
    // a stale spinner bubble on next session.
    expect(cached!.value[0].pending).toBeUndefined();
    expect(cached!.value[0].content).toBe('sent-via-bridge');
  });


  it('seedCacheForRelay paints cached messages into messagesByGroup before live REQ', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { cacheSet } = await import('@/services/nostr-bridge/cache/cache');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'msg-cache-seed';
    const relay = impl.currentRelayUrl.get();

    // Pre-populate the cache as if a previous session had written 3 messages.
    const baseTs = Math.floor(Date.now() / 1000) - 60;
    cacheSet(relay, 9, groupId, [
      { id: 'a', pubkey: 'x'.repeat(64), content: 'cold-1', createdAt: baseTs, kind: 9, replyToId: null, mentions: [] },
      { id: 'b', pubkey: 'y'.repeat(64), content: 'cold-2', createdAt: baseTs + 1, kind: 9, replyToId: null, mentions: [] },
      { id: 'c', pubkey: 'z'.repeat(64), content: 'cold-3', createdAt: baseTs + 2, kind: 9, replyToId: null, mentions: [] },
    ]);

    // switchRelay re-runs seedCacheForRelay against the (same) relay url and
    // re-paints from the just-written cache, mirroring what a fresh page
    // load does on cold start.
    await bridge.switchRelay(relay);
    await flush();

    const inMemory = impl.messagesByGroup.get()[groupId] ?? [];
    expect(inMemory.map((m) => m.content)).toEqual(['cold-1', 'cold-2', 'cold-3']);
    expect(impl.messagesStatusByGroup.get()[groupId]).toBe('has-messages');
  });


  it('does not paint hidden channels or messages from cache before live relay confirmation', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { cacheSet } = await import('@/services/nostr-bridge/cache/cache');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'hidden-cache-seed';
    const relay = impl.currentRelayUrl.get();
    cacheSet(relay, 39000, groupId, {
      group: {
        id: groupId,
        name: 'Secret channel',
        about: null,
        picture: null,
        banner: null,
        isPublic: false,
        isHidden: true,
        isRestricted: true,
        isOpen: false,
        parent: null,
        kind: 'text' as const,
        forumTags: [],
        topics: [],
      },
      createdAt: Math.floor(Date.now() / 1000),
    });
    cacheSet(relay, 9, groupId, [
      { id: 'secret-msg', pubkey: 'x'.repeat(64), content: 'secret', createdAt: 1, kind: 9, replyToId: null, mentions: [] },
    ]);

    await bridge.switchRelay(relay);
    await flush();

    expect(impl.groups.get().some((group) => group.id === groupId)).toBe(false);
    expect(impl.messagesByGroup.get()[groupId]).toBeUndefined();
  });


  it('setActiveGroup seeds cached messages when the channel memory is empty', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { cacheSet } = await import('@/services/nostr-bridge/cache/cache');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'active-cache-seed';
    const relay = impl.currentRelayUrl.get();
    const baseTs = Math.floor(Date.now() / 1000) - 60;
    cacheSet(relay, 9, groupId, [
      { id: 'active-a', pubkey: 'x'.repeat(64), content: 'active-cold-1', createdAt: baseTs, kind: 9, replyToId: null, mentions: [] },
      { id: 'active-b', pubkey: 'y'.repeat(64), content: 'active-cold-2', createdAt: baseTs + 1, kind: 9, replyToId: null, mentions: [] },
    ]);

    expect(impl.messagesByGroup.get()[groupId]).toBeUndefined();

    bridge.setActiveGroup(groupId);

    const inMemory = impl.messagesByGroup.get()[groupId] ?? [];
    expect(inMemory.map((m) => m.content)).toEqual(['active-cold-1', 'active-cold-2']);
    expect(impl.messagesStatusByGroup.get()[groupId]).toBe('has-messages');
  });


  it('refreshGroupMessages keeps cached messages visible while the live REQ restarts', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { cacheSet } = await import('@/services/nostr-bridge/cache/cache');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'refresh-cache-seed';
    const relay = impl.currentRelayUrl.get();
    const baseTs = Math.floor(Date.now() / 1000) - 60;
    cacheSet(relay, 9, groupId, [
      { id: 'refresh-a', pubkey: 'x'.repeat(64), content: 'refresh-cold', createdAt: baseTs, kind: 9, replyToId: null, mentions: [] },
    ]);

    bridge.setActiveGroup(groupId);
    await flush();
    impl.messagesStatusByGroup.update((prev) => ({ ...prev, [groupId]: 'empty-confirmed' }));

    bridge.refreshGroupMessages(groupId);

    expect(impl.messagesByGroup.get()[groupId]?.map((m) => m.content)).toEqual(['refresh-cold']);
    expect(impl.messagesStatusByGroup.get()[groupId]).toBe('has-messages');
  });


  it('ingestReaction persists to bridgeCache and seedCacheForRelay paints it', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { cacheGet, cacheSet } = await import('@/services/nostr-bridge/cache/cache');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'rxn-cache';
    bridge.subscribeReactions(groupId, () => {});
    await flush();

    // Drive an inbound reaction through the relay.
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const rxnEv = finalizeEvent(
      {
        kind: 7,
        content: '🔥',
        tags: [['e', 'tgt-1'], ['h', groupId]],
        created_at: Math.floor(Date.now() / 1000),
        pubkey: pk,
      } as Parameters<typeof finalizeEvent>[0],
      sk,
    );

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      deliver(rxnEv);
      await vi.advanceTimersByTimeAsync(300);
    } finally {
      vi.useRealTimers();
    }
    await flush();

    const cached = cacheGet<Record<string, { emoji: string }[]>>(
      impl.currentRelayUrl.get(),
      7,
      groupId,
    );
    expect(cached).toBeTruthy();
    expect(cached!.value['tgt-1']).toBeDefined();
    expect(cached!.value['tgt-1'][0].emoji).toBe('🔥');

    // Now wipe in-memory state and verify the seed re-populates from cache.
    impl.reactionsByGroup.set({});
    // Write a sentinel cache value so we can prove the seed read it.
    cacheSet(impl.currentRelayUrl.get(), 7, groupId, {
      'tgt-2': [{ id: 'r2', pubkey: pk, emoji: '👀', targetEventId: 'tgt-2', createdAt: 1 }],
    });
    await bridge.switchRelay(impl.currentRelayUrl.get());
    await flush();

    const seeded = impl.reactionsByGroup.get()[groupId];
    expect(seeded).toBeTruthy();
    expect(seeded['tgt-2'][0].emoji).toBe('👀');
  });


  it('logout wipes the bridgeCache so the next user does not inherit cached messages', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { cacheGet } = await import('@/services/nostr-bridge/cache/cache');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'msg-cache-logout';
    bridge.subscribeMessages(groupId, () => {});
    await flush();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      deliver(await fakeRelayMessage({ groupId, content: 'before logout' }));
      await vi.advanceTimersByTimeAsync(300);
    } finally {
      vi.useRealTimers();
    }
    await flush();
    const relay = impl.currentRelayUrl.get();
    expect(cacheGet(relay, 9, groupId)).toBeTruthy();

    await bridge.logout();
    // Logout calls cacheClearAll synchronously via the shared
    // clearLocalStateAfterLogout helper: the next read must miss.
    expect(cacheGet(relay, 9, groupId)).toBeNull();
  });


  it('returns end for normal relay pagination only after a confirmed empty page', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const groupId = 'normal-pagination-empty';
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    bridge.setActiveGroup(groupId);
    deliver(await fakeRelayMetadata({ groupId, name: 'Normal Pagination' }));
    await flush();
    deliver(await fakeRelayMessage({ groupId, content: 'newest normal message' }));
    await flush();

    const impl = getBridgeImpl()!;
    impl.relayAccess.set({ [impl.currentRelayUrl.get()]: 'ok' });

    await expect(bridge.loadMoreMessages(groupId)).resolves.toBe('end');
  });


  it('keeps pagination retryable when the relay never sends EOSE', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const groupId = 'normal-pagination-error';
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    bridge.setActiveGroup(groupId);
    deliver(await fakeRelayMetadata({ groupId, name: 'Normal Pagination Error' }));
    await flush();
    deliver(await fakeRelayMessage({ groupId, content: 'newest normal message' }));
    await flush();

    const impl = getBridgeImpl()!;
    impl.relayAccess.set({ [impl.currentRelayUrl.get()]: 'ok' });
    fake.state.suppressNextEose = true;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pending = bridge.loadMoreMessages(groupId);
      await vi.advanceTimersByTimeAsync(5000);
      await expect(pending).resolves.toBe('unavailable');
    } finally {
      vi.useRealTimers();
    }
  });


  it('adds older messages from normal relay pagination', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const groupId = 'normal-pagination-added';
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    bridge.setActiveGroup(groupId);
    deliver(await fakeRelayMetadata({ groupId, name: 'Normal Pagination Added' }));
    await flush();
    const newest = await fakeRelayMessage({ groupId, content: 'newest normal message' });
    const older = {
      ...(await fakeRelayMessage({ groupId, content: 'older normal page' })),
      id: 'older-normal-page',
      created_at: newest.created_at - 10,
    };
    deliver(newest);
    await flush();

    const impl = getBridgeImpl()!;
    impl.relayAccess.set({ [impl.currentRelayUrl.get()]: 'ok' });
    fake.state.published.push(older);

    await expect(bridge.loadMoreMessages(groupId)).resolves.toBe('added');
    expect(impl.messagesByGroup.get()[groupId]?.map((m) => m.content)).toEqual([
      'older normal page',
      'newest normal message',
    ]);
  });
});
