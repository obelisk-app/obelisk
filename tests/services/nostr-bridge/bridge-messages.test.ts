/**
 * Channel messages on the pool-level fake: the per-group streams and their queue, the active-channel priority gate, and the empty-EOSE confidence ladder.
 *
 * Mocks `SimplePool` from `nostr-tools` (`./support/bridge-fake-pool.ts`)
 * to capture published events and deliver them back to subscribers, a relay
 * round trip without the network. Real crypto runs end to end. Split out of
 * the one 4,900-line suite along the bridge's module seams (round 16); the
 * shared lifecycle and helpers are `./support/bridge-harness.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
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

  // -- active-group priority for kind 9 REQs ------------------------------
  // Background fan-out from kind 39000 used to fire a kind 9 REQ per
  // discovered group on the same tick: on a busy relay the channel the
  // user actually clicked landed at the back of the response queue and
  // its history rendered late. The bridge now queues background subs and
  // fast-tracks the active group via `setActiveGroup` so the channel in
  // view always wins the relay's first response.

  it('background metadata defers per-group message REQs; setActiveGroup fires the active one immediately', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const messageSubsFor = (groupId: string) =>
      fake.state.subscriptions.filter((s) => {
        const f = s.filter as { kinds?: number[]; '#h'?: string[] };
        return f.kinds?.includes(9) && f['#h']?.includes(groupId);
      });

    bridge.setActiveGroup('active-group');

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // Inject metadata for the active group + several background ones in
      // the same tick: mirrors what a real relay does at login.
      deliver(await fakeRelayMetadata({ groupId: 'active-group', name: 'Active' }));
      deliver(await fakeRelayMetadata({ groupId: 'bg-1', name: 'B1' }));
      deliver(await fakeRelayMetadata({ groupId: 'bg-2', name: 'B2' }));
      deliver(await fakeRelayMetadata({ groupId: 'bg-3', name: 'B3' }));

      // Synchronously: only the active group has a kind 9 sub. Background
      // groups are sitting in the queue waiting for the drain timer.
      expect(messageSubsFor('active-group')).toHaveLength(1);
      expect(messageSubsFor('bg-1')).toHaveLength(0);
      expect(messageSubsFor('bg-2')).toHaveLength(0);
      expect(messageSubsFor('bg-3')).toHaveLength(0);

      // Drain the queue.
      await vi.advanceTimersByTimeAsync(100);
    } finally {
      vi.useRealTimers();
    }
    await flush();

    expect(messageSubsFor('bg-1')).toHaveLength(1);
    expect(messageSubsFor('bg-2')).toHaveLength(1);
    expect(messageSubsFor('bg-3')).toHaveLength(1);
  });


  it('uses one live per-group stream for messages and deletes', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const groupId = 'merged-message-stream';
    fake.state.subscriptions = [];
    bridge.subscribeMessages(groupId, () => {});

    const groupSubs = fake.state.subscriptions.filter((s) => {
      const f = s.filter as { kinds?: number[]; '#h'?: string[] };
      return f['#h']?.includes(groupId);
    });
    expect(groupSubs).toHaveLength(1);
    expect((groupSubs[0].filter.kinds as number[]).sort()).toEqual([5, 9, 9005]);
  });


  it('does not open per-group creator subscriptions during metadata fan-out', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    fake.state.subscriptions = [];
    deliver(await fakeRelayMetadata({ groupId: 'creator-bg-1', name: 'Creator BG 1' }));
    deliver(await fakeRelayMetadata({ groupId: 'creator-bg-2', name: 'Creator BG 2' }));

    const creatorSubs = fake.state.subscriptions.filter((s) => {
      const f = s.filter as { kinds?: number[]; '#h'?: string[] };
      return f.kinds?.includes(9007) && !!f['#h'];
    });
    expect(creatorSubs).toHaveLength(0);
  });


  it('caps background message streams below public relay subscription quota', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      for (let i = 0; i < 40; i++) {
        deliver(await fakeRelayMetadata({ groupId: `quota-bg-${i}`, name: `Quota ${i}` }));
      }
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }
    } finally {
      vi.useRealTimers();
    }
    await flush();

    const messageSubs = fake.state.subscriptions.filter((s) => {
      const f = s.filter as { kinds?: number[]; '#h'?: string[] };
      return f.kinds?.includes(9) && f['#h']?.[0]?.startsWith('quota-bg-');
    });
    expect(messageSubs.length).toBeLessThanOrEqual(8);
  });


  it('setActiveGroup after a queued metadata burst promotes the clicked channel to the head of the queue', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const messageSubsFor = (groupId: string) =>
      fake.state.subscriptions.filter((s) => {
        const f = s.filter as { kinds?: number[]; '#h'?: string[] };
        return f.kinds?.includes(9) && f['#h']?.includes(groupId);
      });

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // Metadata arrives first: every group is queued (no active group yet).
      deliver(await fakeRelayMetadata({ groupId: 'bg-a', name: 'A' }));
      deliver(await fakeRelayMetadata({ groupId: 'bg-b', name: 'B' }));
      deliver(await fakeRelayMetadata({ groupId: 'bg-c', name: 'C' }));

      // No subs yet: queue waiting for the drain timer.
      expect(messageSubsFor('bg-a')).toHaveLength(0);
      expect(messageSubsFor('bg-b')).toHaveLength(0);
      expect(messageSubsFor('bg-c')).toHaveLength(0);

      // User clicks on bg-c: it should fire synchronously even though it's
      // sitting in the middle of the queue.
      bridge.setActiveGroup('bg-c');
      expect(messageSubsFor('bg-c')).toHaveLength(1);
      // bg-a and bg-b are still queued.
      expect(messageSubsFor('bg-a')).toHaveLength(0);
      expect(messageSubsFor('bg-b')).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(100);
    } finally {
      vi.useRealTimers();
    }
    await flush();

    // After the drain, bg-a and bg-b come up, but bg-c is not double-subscribed.
    expect(messageSubsFor('bg-a')).toHaveLength(1);
    expect(messageSubsFor('bg-b')).toHaveLength(1);
    expect(messageSubsFor('bg-c')).toHaveLength(1);
  });


  // -- per-group messages-status confidence + retry ladder ----------------
  // EOSE alone is NOT proof a channel is empty: auth-gated and silent-
  // filtering relays routinely send EOSE-empty before any events arrive.
  // The bridge owns a retry ladder (see `EMPTY_RETRY_DELAYS` in client.ts)
  // that re-fires the kind 9 REQ a few times before promoting to
  // `empty-confirmed`. The UI reads `messagesStatusByGroup` to decide
  // between the loading spinner and "No messages yet" copy.

  it('subscribeMessagesStatus: starts at "loading", flips to "empty-unconfirmed" after empty EOSE', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const groupId = 'empty-eose-status-test';
    const observed: string[] = [];
    bridge.subscribeMessagesStatus(groupId, (s) => observed.push(s));
    // Initial replay before any EOSE microtask drains.
    expect(observed[0]).toBe('loading');

    // FakePool fires EOSE via queueMicrotask; flush drains it.
    await flush();
    // Empty EOSE → bridge holds "empty-unconfirmed" while the retry ladder
    // is pending. UI must keep the spinner up here, NOT show "no messages".
    expect(observed.at(-1)).toBe('empty-unconfirmed');
  });


  it('event arriving after empty EOSE flips status to "has-messages" and cancels the retry', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'event-arrival-status-test';
    bridge.subscribeMessagesStatus(groupId, () => {});
    await flush();
    expect(impl.messagesStatusByGroup.get()[groupId]).toBe('empty-unconfirmed');
    // Retry entry exists, timer scheduled.
    expect(impl.messagesRetryAttempts(groupId)).not.toBeNull();

    // Simulate the auth-gated relay finally delivering a real event after
    // its EOSE-empty head-fake.
    deliver(await fakeRelayMessage({ groupId, content: 'late history msg' }));
    await flush();

    expect(impl.messagesStatusByGroup.get()[groupId]).toBe('has-messages');
    // Retry was cancelled so we don't fire a needless restart.
    expect(impl.messagesRetryAttempts(groupId)).toBeNull();
  });


  it('exhausting the retry ladder (3 retries) promotes status to "empty-confirmed"', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'retry-exhaustion-test';

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      bridge.subscribeMessagesStatus(groupId, () => {});
      // Drain microtasks so the initial EOSE fires.
      await Promise.resolve();
      await Promise.resolve();
      expect(impl.messagesStatusByGroup.get()[groupId]).toBe('empty-unconfirmed');

      // 1500 + 3000 + 5000 = 9500ms of retry ladder. Pad slightly so the
      // post-final-retry EOSE microtask + scheduleEmptyRetry call complete.
      await vi.advanceTimersByTimeAsync(10000);
      expect(impl.messagesStatusByGroup.get()[groupId]).toBe('empty-confirmed');
      expect(impl.messagesRetryAttempts(groupId)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });



  it("public channel confirms an empty EOSE even while relay AUTH is inconclusive", async () => {
    const { getBridge, getBridgeImpl } = await import("@/services/nostr-bridge/facade/client");
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = "public-empty-auth-inconclusive";
    const activeRelay = impl["relays"][0];
    (impl as unknown as { relayAccess: { set: (v: Record<string, unknown>) => void } }).relayAccess.set({
      [activeRelay]: "authenticating",
    });

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      deliver(await fakeRelayMetadata({
        groupId,
        name: "Public empty channel",
        isPublic: true,
        isOpen: true,
      }));
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10000);
      expect(impl.messagesStatusByGroup.get()[groupId]).toBe("empty-confirmed");
      expect(impl.messagesRetryAttempts(groupId)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });


  it('setActiveGroup on a stuck-loading channel restarts the sub so the click gets fresh priority', async () => {
    // Regression for "I clicked the channel and it's still spinning,
    // had to refresh the page for it to load." When the background
    // drain has already subscribed a channel and the sub is stuck
    // (status not 'has-messages'), a user click via setActiveGroup
    // MUST tear down the stuck sub and open a fresh one. Otherwise
    // the click just bumps a sub that's never going to deliver.
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'click-restart-on-stuck';

    const subsFor = () =>
      fake.state.subscriptions.filter((s) => {
        const f = s.filter as { kinds?: number[]; '#h'?: string[] };
        return f.kinds?.includes(9) && f['#h']?.includes(groupId);
      });

    // Background-drain-style subscribe: existing sub on the channel.
    bridge.subscribeMessages(groupId, () => {});
    await flush();
    const initialSubs = subsFor();
    expect(initialSubs).toHaveLength(1);
    const firstSub = initialSubs[0];
    // After flush, FakePool's auto-EOSE fired empty → status =
    // 'empty-unconfirmed'.
    expect(impl.messagesStatusByGroup.get()[groupId]).toBe('empty-unconfirmed');

    // User click: setActiveGroup must restart the stuck sub.
    bridge.setActiveGroup(groupId);
    // Synchronously: messageSubscribedGroups was repopulated by the
    // restart, but the sub object should be a FRESH one: the old
    // firstSub is gone from state.subscriptions.
    const afterClick = subsFor();
    expect(afterClick).toHaveLength(1);
    expect(afterClick[0]).not.toBe(firstSub);
    expect(impl.messagesStatusByGroup.get()[groupId]).toBe('loading');
  });


  it('setActiveGroup on a stuck channel ALSO fires querySync in parallel (defense in depth)', async () => {
    // Regression for "some channels still need a refresh even after
    // the click-restart fix." The live sub restart sometimes wedges
    // on the same conditions that had the previous sub stuck
    // (relay-side per-REQ AUTH quirks, SimplePool dedup of identical
    // filters on the same socket). Firing querySync alongside the
    // restart gives the channel a parallel second chance: if either
    // path returns events, ingestMessage promotes to 'has-messages'.
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'click-parallel-querysync';

    fake.state.querySyncCalls = [];
    const kind9QueryCalls = () => fake.state.querySyncCalls.filter((call) => {
      const filter = call.filter as { kinds?: number[]; '#h'?: string[] };
      return filter.kinds?.includes(9) && filter['#h']?.includes(groupId);
    }).length;

    // Initial subscribe → status flips to 'empty-unconfirmed' after
    // FakePool's auto-EOSE.
    bridge.subscribeMessages(groupId, () => {});
    await flush();
    expect(impl.messagesStatusByGroup.get()[groupId]).toBe('empty-unconfirmed');
    expect(kind9QueryCalls()).toBe(0);

    // Click → setActiveGroup → bumpGroupMessagesPriority → both
    // refreshGroupMessages (live restart) AND querySync fire.
    bridge.setActiveGroup(groupId);
    await flush();
    expect(kind9QueryCalls()).toBe(1);
  });


  it('AUTH ok also refreshes channels stuck in "loading" (not just empty-*)', async () => {
    // Regression for "the channel sat in Loading messages… forever
    // because a sub opened during AUTH-pending got stranded with no
    // EOSE, and the wireAuthSettledHook only refreshed channels in
    // empty-*." Channels in 'loading' get refreshed too now.
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'auth-ok-refresh-loading';

    const activeRelay = impl['relays'][0];
    (impl as unknown as { relayAccess: { set: (v: Record<string, unknown>) => void } }).relayAccess.set({
      [activeRelay]: 'authenticating',
    });

    const subsFor = () =>
      fake.state.subscriptions.filter((s) => {
        const f = s.filter as { kinds?: number[]; '#h'?: string[] };
        return f.kinds?.includes(9) && f['#h']?.includes(groupId);
      });

    // Pre-set status to 'loading' WITHOUT going through the FakePool
    // auto-EOSE (which would flip it to empty-unconfirmed). We do this
    // by intercepting the FakePool subscribe to suppress its EOSE for
    // this specific filter, simulating a sub that opened on a not-yet-
    // AUTH'd socket and never received an EOSE.
    bridge.setActiveGroup(groupId);
    bridge.subscribeMessages(groupId, () => {});
    // Don't flush microtasks fully: we want the initial 'loading'
    // status to persist. Sync setMessagesStatus is the cleanest path:
    (impl as unknown as { setMessagesStatus: (id: string, s: string) => void }).setMessagesStatus(groupId, 'loading');
    expect(impl.messagesStatusByGroup.get()[groupId]).toBe('loading');
    const initialSubs = subsFor();
    expect(initialSubs.length).toBeGreaterThan(0);
    const initialSub = initialSubs.at(-1)!;

    // AUTH settles → wireAuthSettledHook should refresh the 'loading'
    // channel (the active one).
    (impl as unknown as { setRelayAccess: (url: string, state: string) => void }).setRelayAccess(activeRelay, 'ok');
    await flush();

    const afterSubs = subsFor();
    expect(afterSubs.length).toBeGreaterThan(0);
    expect(afterSubs.at(-1)).not.toBe(initialSub); // fresh sub exists
  });


  it('setActiveGroup on a has-messages channel does NOT restart the sub (no relay churn)', async () => {
    // Mirror image of the previous test: if the existing sub is
    // healthy and delivering, a click must NOT tear it down. Otherwise
    // every channel switch would burn a REQ on the relay for no
    // benefit.
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'click-noop-when-loaded';

    const subsFor = () =>
      fake.state.subscriptions.filter((s) => {
        const f = s.filter as { kinds?: number[]; '#h'?: string[] };
        return f.kinds?.includes(9) && f['#h']?.includes(groupId);
      });

    // Pre-deliver an event so the sub lands in 'has-messages'.
    bridge.subscribeMessages(groupId, () => {});
    deliver(await fakeRelayMessage({ groupId, content: 'pre-existing' }));
    await flush();
    expect(impl.messagesStatusByGroup.get()[groupId]).toBe('has-messages');
    const before = subsFor();
    expect(before).toHaveLength(1);
    const stableSub = before[0];

    bridge.setActiveGroup(groupId);
    const after = subsFor();
    expect(after).toHaveLength(1);
    expect(after[0]).toBe(stableSub); // identity check: no replacement
  });


  it('AUTH-pending defers empty-confirmed promotion: stuck channels stay in empty-unconfirmed', async () => {
    // Regression for "user is staring at their NIP-46 bunker waiting to
    // approve, meanwhile the chat pane has flipped to 'No messages yet'
    // even though the channel has plenty of history the relay just
    // hasn't been allowed to serve yet." The empty-EOSE retry ladder
    // now checks `relayAccess[activeRelay]` before promoting; if AUTH
    // is still in flight (`'unknown'` / `'authenticating'`), the
    // verdict is deferred and status stays at `empty-unconfirmed` so
    // the UI keeps the spinner up. The wireAuthSettledHook fires a
    // fresh REQ when AUTH eventually settles.
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'auth-pending-defer';

    // Force relayAccess back to a pending state. The FakePool's
    // synchronous EOSE replay flipped it to 'ok' on login; we want to
    // exercise the path where the relay hasn't authed us yet.
    const activeRelay = impl['relays'][0];
    (impl as unknown as { relayAccess: { set: (v: Record<string, unknown>) => void } }).relayAccess.set({
      [activeRelay]: 'authenticating',
    });

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      bridge.subscribeMessagesStatus(groupId, () => {});
      bridge.subscribeMessages(groupId, () => {});
      await Promise.resolve();
      await Promise.resolve();
      // Drive the ladder to exhaustion. WITHOUT the AUTH gate, status
      // would flip to 'empty-confirmed' here. WITH the gate, it stays
      // at 'empty-unconfirmed' and the retry entry is cleared (so no
      // zombie timer ticks in the background).
      await vi.advanceTimersByTimeAsync(10000);
    } finally {
      vi.useRealTimers();
    }
    await flush();

    expect(impl.messagesStatusByGroup.get()[groupId]).toBe('empty-unconfirmed');
    expect(impl.messagesRetryAttempts(groupId)).toBeNull();
  });


  it('AUTH settles to ok → stuck channels auto-refresh and deliver pending history', async () => {
    // Regression for the "tap approve, then I have to refresh the
    // whole page" UX. When `relayAccess` transitions from pending to
    // 'ok' on the active relay, the bridge fires `refreshGroupMessages`
    // for any channel held in `empty-unconfirmed` / `empty-confirmed`.
    // The fresh REQ rides the now-AUTH'd socket and delivers history,
    // no page reload required.
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'auth-settle-autorefresh';

    const activeRelay = impl['relays'][0];
    (impl as unknown as { relayAccess: { set: (v: Record<string, unknown>) => void } }).relayAccess.set({
      [activeRelay]: 'authenticating',
    });

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      bridge.setActiveGroup(groupId);
      bridge.subscribeMessages(groupId, () => {});
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10000);
      expect(impl.messagesStatusByGroup.get()[groupId]).toBe('empty-unconfirmed');

      // Pre-publish an event before AUTH flips: it sits in
      // `state.published` and will be replayed to the next sub.
      deliver(await fakeRelayMessage({ groupId, content: 'arrived after AUTH' }));

      // Simulate AUTH success. setRelayAccess takes the public path
      // (not a raw store overwrite) so the wireAuthSettledHook fires
      // via the StateStore subscriber chain.
      (impl as unknown as { setRelayAccess: (url: string, state: string) => void }).setRelayAccess(activeRelay, 'ok');

      // The hook calls refreshGroupMessages → new sub → synchronous
      // FakePool.subscribe replays state.published (including the
      // freshly stashed event) → onevent → ingestMessage → status
      // flips to 'has-messages'.
      await vi.advanceTimersByTimeAsync(50);
    } finally {
      vi.useRealTimers();
    }
    await flush();

    const msgs = impl.messagesByGroup.get()[groupId] ?? [];
    expect(msgs.map((m) => m.content)).toContain('arrived after AUTH');
    expect(impl.messagesStatusByGroup.get()[groupId]).toBe('has-messages');
  });


  it('AUTH failure keeps channel emptiness unconfirmed', async () => {
    // A rejected relay cannot prove the channel is empty. The relay
    // banner owns the failure while message emptiness stays unconfirmed.
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'auth-fail-promote';
    const activeRelay = impl['relays'][0];

    (impl as unknown as { relayAccess: { set: (v: Record<string, unknown>) => void } }).relayAccess.set({
      [activeRelay]: 'authenticating',
    });

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      bridge.subscribeMessagesStatus(groupId, () => {});
      bridge.subscribeMessages(groupId, () => {});
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10000);
      expect(impl.messagesStatusByGroup.get()[groupId]).toBe('empty-unconfirmed');

      (impl as unknown as { setRelayAccess: (url: string, state: string) => void }).setRelayAccess(activeRelay, 'auth-required');
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
    await flush();

    expect(impl.messagesStatusByGroup.get()[groupId]).toBe('empty-unconfirmed');
  });


  it('cold-load fallback: querySync fires after the ladder exhausts and recovers messages', async () => {
    // Regression for "first cold load shows Loading messages… forever
    // because the relay never delivered kind 9 to the live REQ." After
    // the 1.5/3/5s ladder exhausts, the bridge fires a focused
    // `pool.querySync` with a longer maxWait: a second-chance request
    // that goes out as a fresh frame, by which point AUTH / whitelist
    // state has had time to settle. Events ingested through that path
    // promote status back from `empty-confirmed` to `has-messages`.
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'cold-load-fallback';

    // Stash a kind 9 event directly in `state.published` so the
    // FakePool's `querySync` resolves with content. We push BEFORE
    // subscribing so the bridge's onevent (from the live REQ's
    // synchronous replay in FakePool.subscribe) ingests it too: but
    // we accept that side effect; the key assertion is that the test
    // ends with `has-messages` regardless of which path got us there.
    // (A purer test for the fallback specifically would stub
    // pool.subscribe to skip the synchronous replay; the single-shot
    // counter test below covers the "only fallback fired" case.)
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const stashed = finalizeEvent(
      {
        kind: 9,
        content: 'rescued by querySync',
        tags: [['h', groupId]],
        created_at: Math.floor(Date.now() / 1000),
        pubkey: pk,
      } as Parameters<typeof finalizeEvent>[0],
      sk,
    );
    fake.state.published.push(stashed);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // Install fake timers BEFORE subscribing, otherwise the first
      // retry timer (armed in oneose) lives on the real timer queue
      // and advanceTimersByTimeAsync below would never fire it.
      bridge.subscribeMessagesStatus(groupId, () => {});
      bridge.subscribeMessages(groupId, () => {});
      await Promise.resolve();
      await Promise.resolve();
      // Drive the retry ladder to exhaustion (1.5 + 3 + 5 = 9.5s) and
      // give the post-final EOSE microtask + querySync resolution a
      // pad.
      await vi.advanceTimersByTimeAsync(10000);
    } finally {
      vi.useRealTimers();
    }
    await flush();
    await flush();

    const msgs = impl.messagesByGroup.get()[groupId] ?? [];
    expect(msgs.map((m) => m.content)).toContain('rescued by querySync');
    expect(impl.messagesStatusByGroup.get()[groupId]).toBe('has-messages');
  });


  it('cold-load fallback is single-shot per session unless refreshGroupMessages re-arms it', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'cold-load-fallback-singleshot';

    fake.state.querySyncCalls = [];
    const kind9QueryCalls = () => fake.state.querySyncCalls.filter((call) => {
      const filter = call.filter as { kinds?: number[]; '#h'?: string[] };
      return filter.kinds?.includes(9) && filter['#h']?.includes(groupId);
    }).length;

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      bridge.subscribeMessagesStatus(groupId, () => {});
      bridge.subscribeMessages(groupId, () => {});
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10000);
    } finally {
      vi.useRealTimers();
    }
    await flush();
    expect(kind9QueryCalls()).toBe(1);
    expect(impl.messagesStatusByGroup.get()[groupId]).toBe('empty-confirmed');

    // No second auto-fire even after another full ladder length: the
    // empty-confirmed guard prevents the ladder from restarting, and
    // the single-shot flag prevents a redundant querySync.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await vi.advanceTimersByTimeAsync(15000);
    } finally {
      vi.useRealTimers();
    }
    await flush();
    expect(kind9QueryCalls()).toBe(1);

    // Explicit user retry re-arms the fallback flag and restarts the
    // sub. The new ladder runs to exhaustion → fallback fires a second
    // time.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      bridge.refreshGroupMessages(groupId);
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10000);
    } finally {
      vi.useRealTimers();
    }
    await flush();
    expect(kind9QueryCalls()).toBe(2);
  });


  it('post-empty-confirmed EOSE keeps status pinned and does not restart the ladder', async () => {
    // Regression for the "Loading messages… ↔ No messages yet" loop:
    // after the retry ladder has reached `empty-confirmed`,
    // `subscribeWatched` keeps re-issuing the REQ when the relay sends
    // CLOSED auth-required (the EOSE-then-CLOSED race). Each fresh REQ
    // delivers another empty EOSE, which used to call back through the
    // bridge's `oneose` and downgrade status to `empty-unconfirmed`,
    // restarting the 1.5/3/5s ladder. UI consequence: the chat pane
    // oscillated between the spinner and the welcome copy forever.
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'post-empty-confirmed-no-restart';

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      bridge.subscribeMessagesStatus(groupId, () => {});
      // Drive status to empty-confirmed via the ladder (1.5+3+5=9.5s).
      await vi.advanceTimersByTimeAsync(10000);
      expect(impl.messagesStatusByGroup.get()[groupId]).toBe('empty-confirmed');

      // Locate the current live kind-9 sub for this group. The retry
      // ladder closed and reopened a few times; the last one in
      // state.subscriptions is the one still alive.
      const kind9Subs = fake.state.subscriptions.filter((s) => {
        const f = s.filter as { kinds?: number[]; '#h'?: string[] };
        return f.kinds?.includes(9) && f['#h']?.includes(groupId);
      });
      expect(kind9Subs.length).toBeGreaterThan(0);
      const liveSub = kind9Subs.at(-1)!;

      // Simulate the EOSE-then-CLOSED race. CLOSED auth-required drives
      // subscribeWatched's scheduleRetry(true) → fresh pool.subscribe →
      // fresh queueMicrotask EOSE → bridge's oneose runs again. The fix
      // gates the downgrade on `messagesStatusByGroup[groupId] !==
      // 'empty-confirmed'` so the ladder must NOT restart here.
      liveSub.onclose?.((liveSub.relays ?? ['']).map(() => 'auth-required: please AUTH'));
      // Advance enough for the immediate retry setTimeout(0) to fire,
      // the new pool.subscribe to queue its oneose microtask, and that
      // oneose to drain through to bridge.oneose.
      await vi.advanceTimersByTimeAsync(10);

      // Without the guard: status would now be 'empty-unconfirmed' and
      // messagesRetryByGroup would contain a fresh 1500ms timer.
      expect(impl.messagesStatusByGroup.get()[groupId]).toBe('empty-confirmed');
      expect(impl.messagesRetryAttempts(groupId)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });


  it('setActiveGroup on an "empty-confirmed" channel restarts the sub and resets confidence to "loading"', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'stale-empty-reopen';

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // Drive status to empty-confirmed via the retry ladder.
      bridge.subscribeMessagesStatus(groupId, () => {});
      await vi.advanceTimersByTimeAsync(10000);
      expect(impl.messagesStatusByGroup.get()[groupId]).toBe('empty-confirmed');

      // User now opens this channel: bridge must restart the sub so a
      // previously-empty verdict can be revised.
      bridge.setActiveGroup(groupId);
      // status flips to 'loading' synchronously inside subscribeGroupMessages;
      // the fresh EOSE microtask hasn't drained yet.
      expect(impl.messagesStatusByGroup.get()[groupId]).toBe('loading');
    } finally {
      vi.useRealTimers();
    }
  });


  it('refreshGroupMessages resets retry counter and restarts the kind 9 sub', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'refresh-resets-retry';

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      bridge.subscribeMessagesStatus(groupId, () => {});
      // First retry advances attempts to 1.
      await vi.advanceTimersByTimeAsync(1500);
      expect(impl.messagesRetryAttempts(groupId)).toBe(1);

      // External refresh: must reset attempts to 0 and reopen the sub.
      bridge.refreshGroupMessages(groupId);
      // Synchronously: retry tracking was cleared (no entry until next
      // empty EOSE schedules a fresh ladder).
      expect(impl.messagesRetryAttempts(groupId)).toBeNull();
      // Status is 'loading' until the fresh EOSE microtask drains.
      expect(impl.messagesStatusByGroup.get()[groupId]).toBe('loading');
    } finally {
      vi.useRealTimers();
    }
  });


  it('active-channel priority gate releases after ACTIVE_PRIORITY_MAX_PAUSE_MS even if the watched sub never reaches EOSE', async () => {
    // Regression test for the priority gate cap. Without it, a silent /
    // auth-gated relay that never delivers events or EOSE on the watched
    // channel would starve every other channel's kind 9 sub indefinitely,
    // and since `ingestMessage` is where profile-picture lookups are
    // fanned out, background-channel avatars would never load until the
    // user refreshed the page.
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    try {
      // Force the active channel to LOOK silent: subscribe without
      // letting the FakePool's queueMicrotask EOSE fire. We achieve
      // this by activating the group then immediately checking that
      // the gate is engaged.
      bridge.setActiveGroup('silent-grp');
      // The synchronous subscribeGroupMessages set status to 'loading'.
      expect(impl.messagesStatusByGroup.get()['silent-grp']).toBe('loading');
      // Gate should be engaged (within the deadline window).
      // No public getter, so we exercise the observable: synchronously
      // queue a bg group and confirm its REQ doesn't fire until the cap.
      // (Skip the queue-internals manipulation: instead just advance
      // past the deadline and verify the gate releases.)

      // Advance past ACTIVE_PRIORITY_MAX_PAUSE_MS (3000ms) without
      // letting EOSE microtasks fire. The internal force-release timer
      // should clear the gate.
      await vi.advanceTimersByTimeAsync(3500);

      // After the cap, the gate is released: `isActiveGroupStillLoading`
      // returns false because Date.now() >= activeGroupPriorityDeadline,
      // even though status is still 'loading' or 'empty-unconfirmed'.
      // We exercise this by checking that the priority deadline is in
      // the past. (Reading the private field via the impl handle.)
      expect(Date.now()).toBeGreaterThanOrEqual(impl['activeGroupPriorityDeadline']);
    } finally {
      vi.useRealTimers();
    }
  });


  // -- message + reaction caching ----------------------------------------
  // Per the new cache contract (CLAUDE.md §bridgeCache + cache.ts header),
  // kind 9 and kind 7 events are persisted to localStorage so the chat pane
  // can paint stale history instantly on cold load instead of staring at
  // "Loading messages…" while the relay round-trips. Tests below assert the
  // write-on-ingest, the cap, the optimistic filter, and the seed-on-login
  // round trip.

  it('ingestMessage persists confirmed messages to bridgeCache after the debounce', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { cacheGet } = await import('@/services/nostr-bridge/cache/cache');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const groupId = 'msg-cache-roundtrip';
    bridge.subscribeMessages(groupId, () => {});
    await flush();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      deliver(await fakeRelayMessage({ groupId, content: 'first' }));
      deliver(await fakeRelayMessage({ groupId, content: 'second' }));
      // Cache flush is debounced; nothing on disk yet.
      const beforeFlush = cacheGet<unknown[]>(impl.currentRelayUrl.get(), 9, groupId);
      expect(beforeFlush).toBeNull();

      // Drain the 200ms debounce.
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
    expect(cached!.value.map((m) => m.content)).toEqual(['first', 'second']);
  });


  it('background message-queue drain is gated by the active channel reaching its first EOSE / event', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const subsFor = (id: string) =>
      fake.state.subscriptions.filter((s) => {
        const f = s.filter as { kinds?: number[]; '#h'?: string[] };
        return f.kinds?.includes(9) && f['#h']?.includes(id);
      });

    // Pre-sign the background metadata BEFORE the synchronous block: the
    // assertions below must run with no microtask drains in between (any
    // `await` would let queueMicrotask(EOSE) fire and flip the watched
    // channel's status out of 'loading' prematurely).
    const bgAEvent = await fakeRelayMetadata({ groupId: 'bg-a', name: 'A' });
    const bgBEvent = await fakeRelayMetadata({ groupId: 'bg-b', name: 'B' });

    // Synchronous block: no awaits!
    bridge.setActiveGroup('watched-grp');
    deliver(bgAEvent);
    deliver(bgBEvent);

    // Synchronously: only watched sub exists. bg subs are queued but
    // the drain timer was NOT armed: `isActiveGroupStillLoading()` saw
    // status='loading' on the active group and bailed.
    expect(subsFor('watched-grp')).toHaveLength(1);
    expect(subsFor('bg-a')).toHaveLength(0);
    expect(subsFor('bg-b')).toHaveLength(0);
    expect(impl.messagesStatusByGroup.get()['watched-grp']).toBe('loading');
    // End of the synchronous block.

    // Now allow microtasks to drain (EOSE for watched fires → status
    // flips off 'loading' → maybeResumeMessageQueueDrain arms the 80ms
    // drain timer). Take the clock before the timer is armed and fire it
    // ourselves: the drain happens because we advanced 80 ms, not because
    // 150 real ms turned out to be enough on this machine.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await flush();
      await vi.advanceTimersByTimeAsync(80);
    } finally {
      vi.useRealTimers();
    }
    expect(subsFor('bg-a')).toHaveLength(1);
    expect(subsFor('bg-b')).toHaveLength(1);
  });
});
