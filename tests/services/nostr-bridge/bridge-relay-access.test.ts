/**
 * Relay access on the pool-level fake: the access banner, CLOSED reasons, the retry and watchdog policy, and quota handling.
 *
 * Mocks `SimplePool` from `nostr-tools` (`./support/bridge-fake-pool.ts`)
 * to capture published events and deliver them back to subscribers, a relay
 * round trip without the network. Real crypto runs end to end. Split out of
 * the one 4,900-line suite along the bridge's module seams (round 16); the
 * shared lifecycle and helpers are `./support/bridge-harness.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { KIND_GROUP_ADMINS, KIND_GROUP_METADATA } from '@/utils/nostr/nip-kinds';
import {
  deliver,
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

  it('relayAccess flips to ok on event/EOSE and stays ok across per-sub CLOSED reasons', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const observed: Array<Record<string, string>> = [];
    bridge.subscribeRelayAccess((m) => observed.push({ ...(m as Record<string, string>) }));

    // EOSE fires from FakePool's subscribe via queueMicrotask: that should
    // flip the active relay to 'ok'.
    await flush();
    const activeRelay = (await import('@/services/nostr-bridge/facade/client')).getBridgeImpl()!['relays'][0];
    const norm = activeRelay.replace(/\/+$/, '').toLowerCase();
    expect(observed.at(-1)?.[norm]).toBe('ok');

    // Once 'ok' has been confirmed (relay is reading us), per-sub CLOSED
    // rejections must NOT downgrade the access state. They normally come
    // from a private channel the user isn't in, a NIP-29 membership race,
    // or an AUTH challenge that resolves a moment later: none of which
    // mean the relay has stopped serving us. Without this guard the
    // "Not whitelisted" banner gets stuck on for users who actually are
    // whitelisted.
    for (const sub of fake.state.subscriptions) {
      const f = sub.filter as { kinds?: number[]; authors?: string[]; limit?: number };
      if (f.kinds?.includes(0) && f.authors?.includes(pkHex) && f.limit === 1) continue;
      const reasons = (sub.relays ?? [activeRelay]).map(() => 'auth was required and attempted, but failed with: Error: auth timed out');
      sub.onclose?.(reasons);
    }
    await flush();
    expect(observed.at(-1)?.[norm]).toBe('ok');

    for (const sub of fake.state.subscriptions) {
      const f = sub.filter as { kinds?: number[]; authors?: string[]; limit?: number };
      if (f.kinds?.includes(0) && f.authors?.includes(pkHex) && f.limit === 1) continue;
      // A per-sub refusal that doesn't name the whitelist (a private group, a
      // NIP-29 membership race). One that does is a relay-wide verdict and
      // overrides sticky-OK: see relay-auth-state.test.ts.
      const reasons = (sub.relays ?? [activeRelay]).map(() => 'restricted: not a member of this group');
      sub.onclose?.(reasons);
    }
    await flush();
    expect(observed.at(-1)?.[norm]).toBe('ok');
  });


  // -- subscribeWatched EOSE-then-CLOSED race --------------------------------
  // Some relays send EOSE (empty result) immediately, then CLOSED auth-required
  // because NIP-42 AUTH didn't complete before the REQ landed. The previous
  // implementation marked the sub `alive` on EOSE and disabled the watchdog,
  // so the subsequent CLOSED killed the sub permanently (the symptom: messages
  // and member metadata don't render until the user refreshes the page).
  // The fix retries the sub when CLOSED carries an auth/restricted reason,
  // regardless of whether EOSE already fired.

  it('retries a sub when CLOSED auth-required arrives after EOSE', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const groupId = 'racetest-eose-then-auth';
    const seen: { id: string; content: string }[][] = [];
    bridge.subscribeMessages(groupId, (msgs) =>
      seen.push(msgs.map((m) => ({ id: m.id, content: m.content }))),
    );
    // Drain the auto-EOSE queueMicrotask. After this, the kind:9 sub is
    // alive=true but armed=true (per the fix): the bug condition.
    await flush();

    const findMessageSubs = () =>
      fake.state.subscriptions.filter((s) => {
        const f = s.filter as { kinds?: number[]; '#h'?: string[] };
        return f.kinds?.includes(9) && f['#h']?.includes(groupId);
      });

    const subsBefore = findMessageSubs();
    expect(subsBefore).toHaveLength(1);
    const firstSub = subsBefore[0];

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // Simulate the race: relay sends CLOSED auth-required after EOSE.
      firstSub.onclose?.((firstSub.relays ?? ['']).map(() => 'auth-required: please AUTH'));
      // The fix schedules an immediate retry (delay 0). Drain it.
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
    await flush();

    // A new sub should now be live for the same filter (the original was
    // closed by scheduleRetry → activeSub.close() → fake removes it from the
    // array).
    const subsAfter = findMessageSubs();
    expect(subsAfter.length).toBeGreaterThanOrEqual(1);
    const retrySub = subsAfter[subsAfter.length - 1];
    expect(retrySub).not.toBe(firstSub);

    // Deliver an event through the retried sub. If the fix is correct, the
    // ingest callback receives it without a page refresh.
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const ev = finalizeEvent(
      {
        kind: 9,
        content: 'after retry',
        tags: [['h', groupId]],
        created_at: Math.floor(Date.now() / 1000),
        pubkey: pk,
      } as Parameters<typeof finalizeEvent>[0],
      sk,
    );
    deliver(ev);
    await flush();

    expect(seen.flat().some((m) => m.content === 'after retry')).toBe(true);
  });


  it('re-issues a sub CLOSED without a classifiable reason after the hub\'s backoff, so the channel is not left dead', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const groupId = 'racetest-benign-close';
    bridge.subscribeMessages(groupId, () => {});
    await flush();

    const findMessageSubs = () =>
      fake.state.subscriptions.filter((s) => {
        const f = s.filter as { kinds?: number[]; '#h'?: string[] };
        return f.kinds?.includes(9) && f['#h']?.includes(groupId);
      });

    const subsBefore = findMessageSubs();
    expect(subsBefore).toHaveLength(1);
    const firstSub = subsBefore[0];

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // Operator-clean close: an empty reason. `parseRelayRejection` returns
      // null, so nothing happens to the access banner, but the REQ is gone
      // on the wire either way. The bridge's own supervisor used to leave it
      // dead (it only retried auth/restricted); the hub's registry treats an
      // unclassified CLOSED as transient and re-issues with backoff (1 s,
      // then doubling, three times before giving up).
      firstSub.onclose?.((firstSub.relays ?? ['']).map(() => ''));
      // Nothing inside the first second: no immediate retry for this class.
      await vi.advanceTimersByTimeAsync(500);
      expect(findMessageSubs()).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(10_000);
    } finally {
      vi.useRealTimers();
    }
    await flush();

    // One live REQ for the filter again, a new one; the relay answered its
    // EOSE so no further retry was scheduled.
    const subsAfter = findMessageSubs();
    expect(subsAfter).toHaveLength(1);
    expect(subsAfter[0]).not.toBe(firstSub);
  });


  // -- slow relay must not look like a dead one ------------------------------
  // Measured 2026-09-12 on public.obelisk.ar: `{kinds:[39000]}` took 20.9s to
  // deliver its first event and `{kinds:[39001,39002]}` 20.4s: twenty seconds
  // for twenty events. Under the 5s default watchdog those subs were torn down
  // and retried forever, each retry restarting the same scan, so the channel
  // list never populated from the relay and the user saw only the disk cache.
  it('gives the relay-wide group subs far longer than 5s to answer', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();

    // No EOSE and no events on any sub: exactly how a relay mid-scan looks.
    fake.state.suppressAllEose = true;

    const countSubs = (kind: number) =>
      fake.state.subscriptionLog.filter((entry) => {
        const f = entry.filter as { kinds?: number[]; '#d'?: string[] };
        return f.kinds?.includes(kind) && !f['#d'];
      }).length;

    // Fake timers must be installed BEFORE the subs open, or the watchdog
    // timer is armed against the real clock and advancing does nothing,
    // which is exactly how this test passed while asserting nothing.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const bridge = await getBridge();
      await bridge.loginWithNsec(skHex, pkHex);
      await vi.advanceTimersByTimeAsync(0);

      const metadataBefore = countSubs(KIND_GROUP_METADATA);
      const adminBefore = countSubs(KIND_GROUP_ADMINS);
      expect(metadataBefore).toBeGreaterThan(0);
      expect(adminBefore).toBeGreaterThan(0);

      // Well past the 5s default, and past the 21s the real relay needs.
      await vi.advanceTimersByTimeAsync(30_000);

      // Not re-issued: a slow answer is still an answer, and retrying is load
      // on a relay that is already too slow.
      expect(countSubs(KIND_GROUP_METADATA)).toBe(metadataBefore);
      expect(countSubs(KIND_GROUP_ADMINS)).toBe(adminBefore);
    } finally {
      vi.useRealTimers();
    }
  });


  it('does NOT retry a sub when CLOSED is relay quota/rate-limit', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const groupId = 'racetest-quota-close';
    bridge.subscribeMessages(groupId, () => {});
    await flush();

    const findMessageSubs = () =>
      fake.state.subscriptions.filter((sub) => {
        const f = sub.filter as { kinds?: number[]; '#h'?: string[] };
        return f.kinds?.includes(9) && f['#h']?.includes(groupId);
      });

    const firstSub = findMessageSubs()[0];
    expect(firstSub).toBeTruthy();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      firstSub.onclose?.((firstSub.relays ?? ['']).map(() => 'restricted: Subscription quota exceeded: 50/50'));
      await vi.advanceTimersByTimeAsync(60_000);
    } finally {
      vi.useRealTimers();
    }
    await flush();

    expect(findMessageSubs()).toHaveLength(0);
  });


  it('frees the group slot when a message sub is CLOSED for relay quota', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const groupId = 'quota-slot-freed';
    bridge.subscribeMessages(groupId, () => {});
    await flush();

    const impl = getBridgeImpl()!;
    const findMessageSubs = () =>
      fake.state.subscriptions.filter((sub) => {
        const f = sub.filter as { kinds?: number[]; '#h'?: string[] };
        return f.kinds?.includes(9) && f['#h']?.includes(groupId);
      });

    const firstSub = findMessageSubs()[0];
    expect(firstSub).toBeTruthy();
    expect(impl['messageSubscribedGroups'].has(groupId)).toBe(true);

    firstSub.onclose?.((firstSub.relays ?? ['']).map(() => 'restricted: Subscription quota exceeded: 50/50'));
    await flush();

    expect(findMessageSubs()).toHaveLength(0);
    expect(impl['messageSubscribedGroups'].has(groupId)).toBe(false);
    expect(impl['messageSubByGroup'].has(groupId)).toBe(false);

    bridge.subscribeMessages(groupId, () => {});
    await flush();

    expect(findMessageSubs()).toHaveLength(1);
    expect(impl['messageSubscribedGroups'].has(groupId)).toBe(true);
  });


  it('preflight relay-access keeps EOSE-accepted slot available for immediate CLOSED downgrade', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const preflightSubs = fake.state.subscriptions.filter((sub) => {
      const f = sub.filter as { kinds?: number[]; authors?: string[]; limit?: number };
      return f.kinds?.length === 1 && f.kinds[0] === 0 && f.authors?.includes(pkHex) && f.limit === 1;
    });

    expect(preflightSubs).toHaveLength(1);
  });


  it('caps the auth-required immediate retry: second onclose falls back to backoff', async () => {
    // Regression for the kind-9 tight-loop bug: when a relay persistently
    // rejects with CLOSED auth-required, the old scheduleRetry path fired
    // a fresh REQ at 0ms delay on EVERY close (the comment claimed
    // "subsequent failures hit backoff" but the code always passed
    // immediate=true). That tight loop hammered the relay and starved
    // every other REQ (admin/member, kind 0, branding). The fix caps the
    // immediate path to the first onclose; subsequent closes use the
    // standard exponential backoff.
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const groupId = 'auth-required-backoff-after-first';
    bridge.subscribeMessages(groupId, () => {});
    await flush();

    const findMessageSubs = () =>
      fake.state.subscriptions.filter((s) => {
        const f = s.filter as { kinds?: number[]; '#h'?: string[] };
        return f.kinds?.includes(9) && f['#h']?.includes(groupId);
      });

    const firstSub = findMessageSubs().at(-1)!;
    expect(firstSub).toBeTruthy();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // First auth-required CLOSED on this closure (attempt === 1).
      // useImmediate is true → delay 0 → retried sub appears synchronously
      // after the next tick.
      firstSub.onclose?.((firstSub.relays ?? ['']).map(() => 'auth-required: please AUTH'));
      await vi.advanceTimersByTimeAsync(10);
      const secondSub = findMessageSubs().at(-1)!;
      expect(secondSub).toBeTruthy();
      expect(secondSub).not.toBe(firstSub);

      // Second auth-required CLOSED on the retried sub (attempt === 2).
      // useImmediate is now FALSE (the cap kicks in). Delay becomes
      // 2^(attempt-1) * 1000 = 2000ms. Within 100ms of the close, no
      // new sub should have been opened: that's the whole point of the
      // backoff cap.
      secondSub.onclose?.((secondSub.relays ?? ['']).map(() => 'auth-required: please AUTH'));
      await vi.advanceTimersByTimeAsync(100);
      expect(findMessageSubs()).toHaveLength(0);

      // After the full backoff window elapses, the retried sub appears.
      await vi.advanceTimersByTimeAsync(2000);
      const thirdSub = findMessageSubs().at(-1);
      expect(thirdSub).toBeDefined();
      expect(thirdSub).not.toBe(secondSub);
    } finally {
      vi.useRealTimers();
    }
  });


  it('does not flash the relay-access banner on transient auth-required CLOSED', async () => {
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const activeRelay = impl['relays'][0];
    const norm = activeRelay.replace(/\/+$/, '').toLowerCase();

    // Reset relayAccess to simulate the cold-login race in production where
    // CLOSED auth-required can arrive before any EOSE has flipped the active
    // relay to 'ok'. (FakePool auto-EOSEs synchronously via queueMicrotask,
    // so by `await flush()` the state is already 'ok': sticky-OK would
    // otherwise mask the deferred-soak path entirely.)
    (impl as unknown as { relayAccess: { set: (v: Record<string, unknown>) => void } }).relayAccess.set({});

    const observed: Array<string | undefined> = [];
    bridge.subscribeRelayAccess((m) =>
      observed.push((m as Record<string, string>)[norm]),
    );

    // Fire CLOSED auth-required on every non-preflight sub. Without the
    // soak guard the banner state would flip to 'auth-required' immediately
    // for each sub. With the guard, the downgrade is deferred and the
    // retry path gets a chance to heal it back to 'ok' first.
    //
    // The whitelist preflight sub (kind 0, authors=[me], limit 1) is
    // explicitly excluded: it uses `immediateAccessDowngrade: true` so
    // a rejection on the preflight surfaces within ~1.5s. The deferred-
    // soak contract still holds for every other sub.
    const isPreflight = (sub: { filter?: Record<string, unknown> }) => {
      const kinds = sub.filter?.kinds as number[] | undefined;
      const authors = sub.filter?.authors as string[] | undefined;
      const limit = sub.filter?.limit as number | undefined;
      return (
        Array.isArray(kinds) &&
        kinds.length === 1 &&
        kinds[0] === 0 &&
        Array.isArray(authors) &&
        authors.includes(pkHex) &&
        limit === 1
      );
    };
    // The reason is nostr-tools' failed-AUTH wrapper: on a sub carrying
    // `onauth` the pool swallows a bare `auth-required: ` and retries AUTH
    // itself, so a transient race only ever reaches us in this form. (A bare
    // `auth-required:` reaching us means AUTH succeeded and we were refused:
    // see classifyAccessClose.)
    for (const sub of fake.state.subscriptions) {
      if (isPreflight(sub)) continue;
      const reasons = (sub.relays ?? [activeRelay]).map(() => 'auth was required and attempted, but failed with: Error: auth timed out');
      sub.onclose?.(reasons);
    }
    await flush();

    expect(observed).not.toContain('auth-required');
    expect(observed).not.toContain('restricted');
  });


  it('schedules at most one retry when CLOSED auth-required fires twice', async () => {
    const { getBridge } = await import('@/services/nostr-bridge/facade/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const groupId = 'racetest-dedup';
    bridge.subscribeMessages(groupId, () => {});
    await flush();

    const findMessageSubs = () =>
      fake.state.subscriptions.filter((s) => {
        const f = s.filter as { kinds?: number[]; '#h'?: string[] };
        return f.kinds?.includes(9) && f['#h']?.includes(groupId);
      });

    const subsBefore = findMessageSubs();
    expect(subsBefore).toHaveLength(1);
    const firstSub = subsBefore[0];
    const reasons = (firstSub.relays ?? ['']).map(() => 'auth-required: please AUTH');

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      // Fire CLOSED twice in a row: both calls hit scheduleRetry but the
      // `armed` token disarms after the first, so the second is a no-op.
      firstSub.onclose?.(reasons);
      firstSub.onclose?.(reasons);
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
    await flush();

    // Exactly one retry sub, not two.
    const subsAfter = findMessageSubs();
    expect(subsAfter).toHaveLength(1);
    expect(subsAfter[0]).not.toBe(firstSub);
  });


  it('drops events delivered to a markClosed sub after switchRelay (no cross-relay bleed)', async () => {
    // Reproduces the user-reported "channels from another relay leaking into
    // Uncategorized" bug. switchRelay markCloses the previous relay's subs
    // but deliberately does NOT call pool.close() on the old WebSockets
    // (avoids per-sub CLOSING/CLOSED console spam: see
    // resetSessionState comment). The old sockets stay alive until
    // GC and can still deliver events. Without the closed-guard in
    // subscribeWatched.onevent, those late events would be ingested into the
    // post-switch state: both polluting `this.groups` and writing the old
    // relay's group under the new relay's cache key (since
    // `cacheSet(this.currentRelayUrl.get(), ...)` uses whichever relay is
    // currently active).
    const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
    const { cacheGet } = await import('@/services/nostr-bridge/cache/cache');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    // Capture the kind 39000 sub created by `subscribeGroupMetadata` on the
    // default relay. After switchRelay this is the closure that must drop
    // late events.
    const findMetaSubs = () =>
      fake.state.subscriptions.filter((s) => {
        const f = s.filter as { kinds?: number[] };
        return Array.isArray(f.kinds) && f.kinds.includes(39000) && !('#d' in (s.filter as object));
      });
    const subsBefore = findMetaSubs();
    expect(subsBefore.length).toBeGreaterThanOrEqual(1);
    const oldRelaySub = subsBefore[0];

    // Switch to a different relay. switchRelay clears `this.groups`, replaces
    // the pool, opens fresh subs, and seeds the cache for the new relay
    // (which is empty here).
    const NEW_RELAY = 'wss://relay-bleed-test.example';
    await bridge.switchRelay(NEW_RELAY);
    await flush();

    const impl = getBridgeImpl()!;
    expect(impl.groups.get()).toEqual([]);
    expect(impl.currentRelayUrl.get()).toBe(NEW_RELAY);

    // The old kind-39000 sub object is still in the fake's state.subscriptions
    // array because markClosed nullifies the local activeSub reference but
    // doesn't call its close() (the comment explains why). Simulate an
    // in-flight kind 39000 from the OLD relay arriving on its zombie socket
    // by invoking the old sub's sink directly.
    const staleEvent = await fakeRelayMetadata({
      groupId: 'leaked-from-old-relay',
      name: 'Leaked Channel',
      isPublic: true,
      isOpen: true,
    });
    oldRelaySub.sink(staleEvent);
    await flush();

    // The post-switch groups store must NOT contain the leaked group.
    expect(impl.groups.get().some((g) => g.id === 'leaked-from-old-relay')).toBe(false);
    // And the new relay's cache must NOT have an entry for it (the bug
    // wrote `cacheSet(NEW_RELAY, 39000, 'leaked-from-old-relay', ...)`).
    expect(cacheGet(NEW_RELAY, 39000, 'leaked-from-old-relay')).toBeNull();
  });
});
