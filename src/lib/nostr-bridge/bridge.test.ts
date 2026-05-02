/**
 * Integration test for the nostr bridge.
 *
 * Mocks `SimplePool` from `nostr-tools` to capture published events and
 * deliver them back to subscribers, simulating a relay round-trip without
 * touching the network. Real crypto (finalizeEvent, getPublicKey, nip04,
 * nip19) runs end-to-end so signatures, encryption, and bech32 encoding
 * are exercised.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey, nip19, finalizeEvent, type Event as NostrEvent, type Filter } from 'nostr-tools';

type Sink = (ev: NostrEvent) => void;

const fake = vi.hoisted(() => {
  const state = {
    published: [] as Array<{ kind: number; pubkey: string; tags: string[][]; content: string; id: string }>,
    subscriptions: [] as Array<{
      filter: Record<string, unknown>;
      sink: (ev: any) => void;
      relays?: string[];
      onclose?: (reasons: string[]) => void;
    }>,
  };

  function matchesInternal(f: Record<string, unknown>, ev: { kind: number; pubkey: string; tags: string[][] }): boolean {
    if (Array.isArray(f.kinds) && !(f.kinds as number[]).includes(ev.kind)) return false;
    if (Array.isArray(f.authors) && !(f.authors as string[]).includes(ev.pubkey)) return false;
    for (const k of Object.keys(f)) {
      if (!k.startsWith('#')) continue;
      const tag = k.slice(1);
      const wanted = f[k] as string[];
      const present = ev.tags.some((t) => t[0] === tag && wanted.includes(t[1]));
      if (!present) return false;
    }
    return true;
  }

  class FakePool {
    subscribe(relays: string[], filter: Record<string, unknown>, opts: { onevent: (ev: any) => void; oneose?: () => void; onclose?: (reasons: string[]) => void; onauth?: unknown }) {
      const sub = { filter, sink: opts.onevent, relays, onclose: opts.onclose };
      state.subscriptions.push(sub);
      for (const ev of state.published) if (matchesInternal(filter, ev as any)) opts.onevent(ev);
      // Fire EOSE so subscribeWatched's watchdog marks the sub as alive and
      // doesn't queue retries during tests.
      queueMicrotask(() => opts.oneose?.());
      return { close: () => { state.subscriptions = state.subscriptions.filter((s) => s !== sub); } };
    }
    publish(_relays: string[], event: any): Promise<string>[] {
      state.published.push(event);
      queueMicrotask(() => {
        for (const sub of state.subscriptions) if (matchesInternal(sub.filter, event)) sub.sink(event);
      });
      return [Promise.resolve('ok')];
    }
    close(_relays: string[]): void {
      state.subscriptions = [];
    }
    /**
     * The bridge's `connect()` awaits `pool.ensureRelay(url, ...)` before
     * issuing REQs (post Fix A: login no longer flips `isLoggedIn` until
     * connect resolves). The fake returns `connected: true` instantly so
     * tests pretend every relay is reachable.
     */
    async ensureRelay(_url: string, _opts?: { connectionTimeout?: number }): Promise<{ connected: boolean; onclose?: () => void }> {
      return { connected: true };
    }
  }

  return { state, FakePool, matchesInternal };
});

vi.mock('nostr-tools', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, SimplePool: fake.FakePool };
});

function matches(f: Filter, ev: NostrEvent): boolean {
  return fake.matchesInternal(f as any, ev);
}

// Import bridge AFTER the mock is registered.
import { getBridge, decodeNsec } from './client';

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

function makeKeypair() {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const nsec = nip19.nsecEncode(sk);
  return { skHex: bytesToHex(sk), pkHex: pk, nsec };
}

async function flush(times = 4) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

beforeEach(() => {
  (() => { fake.state.published = []; fake.state.subscriptions = []; })();
  // Each test starts fresh — clear the bridge module-level singleton by
  // resetting modules so getBridge() returns a new instance.
  vi.resetModules();
  // Clear localStorage between tests so persisted sessions don't bleed.
  if (typeof window !== 'undefined') window.localStorage.clear();
});

afterEach(() => {
  (() => { fake.state.published = []; fake.state.subscriptions = []; })();
});

describe('nostr-bridge', () => {
  it('decodeNsec round-trips with a freshly generated key', () => {
    const { nsec, skHex, pkHex } = makeKeypair();
    const decoded = decodeNsec(nsec);
    expect(decoded.privKeyHex).toBe(skHex);
    expect(decoded.pubKeyHex).toBe(pkHex);
  });

  it('logs in with nsec and exposes the public key', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    expect(bridge.getPublicKey()).toBe(pkHex);
  });

  it('createGroup publishes a kind 9007 + 9002 and the group appears in the groups store', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const groupsSeen: ReadonlyArray<unknown>[] = [];
    bridge.subscribeGroups((g) => groupsSeen.push(g));

    const id = await bridge.createGroup({ name: 'Test Channel', about: 'Hello world', isPublic: true, isOpen: true });
    await flush();

    const kinds = fake.state.published.map((e) => e.kind);
    expect(kinds).toContain(9007);
    expect(kinds).toContain(9002);

    // Author of the metadata isn't necessarily the relay (in NIP-29 it would
    // come from the relay), but our fake pool just echoes whatever is
    // published, including the user's own kind 9002 — which the bridge
    // ingests via its kind 39000 subscription. Since the test relay echoes
    // only what we publish, simulate the relay fanning out by injecting a
    // 39000 metadata event from the "relay".
    const metaEvent: NostrEvent = await fakeRelayMetadata({
      groupId: id, name: 'Test Channel', about: 'Hello world', isPublic: true, isOpen: true,
    });
    deliver(metaEvent);
    await flush();

    const last = groupsSeen.at(-1) as { id: string; name: string | null }[];
    expect(last.find((g) => g.id === id)?.name).toBe('Test Channel');
  });

  it('sendMessage round-trips through subscribers', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const groupId = 'testgroup1';
    const seen: { id: string; content: string }[][] = [];
    bridge.subscribeMessages(groupId, (msgs) => seen.push(msgs.map((m) => ({ id: m.id, content: m.content }))));

    await bridge.sendMessage(groupId, 'hello from test');
    await flush();

    const flat = seen.flat();
    expect(flat.some((m) => m.content === 'hello from test')).toBe(true);
    const published = fake.state.published.filter((e) => e.kind === 9);
    expect(published).toHaveLength(1);
    expect(published[0].tags).toContainEqual(['h', groupId]);
  });

  it('sendReaction emits a kind 7 with target and group tags', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const groupId = 'testgroup2';
    bridge.subscribeReactions(groupId, () => {});
    await bridge.sendReaction('targetEventId123', pkHex, '🔥', groupId);
    await flush();

    const reactions = fake.state.published.filter((e) => e.kind === 7);
    expect(reactions).toHaveLength(1);
    expect(reactions[0].content).toBe('🔥');
    expect(reactions[0].tags).toContainEqual(['e', 'targetEventId123']);
    expect(reactions[0].tags).toContainEqual(['h', groupId]);
  });

  it('NIP-04 DM round-trip: alice → bob, decrypts on bob side', async () => {
    const { getBridge: getBridgeAlice } = await import('./client');
    const alice = makeKeypair();
    const bob = makeKeypair();

    const bridgeA = await getBridgeAlice();
    await bridgeA.loginWithNsec(alice.skHex, alice.pkHex);
    bridgeA.subscribeDirectMessages(() => {});

    await bridgeA.sendDirectMessage(bob.pkHex, 'meet me at the obelisk');
    await flush();

    const dms = fake.state.published.filter((e) => e.kind === 4);
    expect(dms).toHaveLength(1);
    expect(dms[0].pubkey).toBe(alice.pkHex);
    expect(dms[0].tags).toContainEqual(['p', bob.pkHex]);
    // Content is encrypted — should not contain plaintext.
    expect(dms[0].content).not.toContain('meet me');

    // Bob decrypts using nip04 directly.
    const { nip04 } = await import('nostr-tools');
    const plaintext = await nip04.decrypt(bob.skHex, alice.pkHex, dms[0].content);
    expect(plaintext).toBe('meet me at the obelisk');
  });

  it('putUser, removeUser, removePermission, deleteGroupEvent publish the right NIP-29 kinds', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const target = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    await bridge.putUser('grpA', target.pkHex, ['admin']);
    await bridge.removeUser('grpA', target.pkHex);
    await bridge.removePermission('grpA', target.pkHex, ['admin']);
    await bridge.deleteGroupEvent('grpA', 'evt-deadbeef');
    await flush();

    const kinds = fake.state.published.map((e) => e.kind).sort();
    expect(kinds).toContain(9000);
    expect(kinds).toContain(9001);
    expect(kinds).toContain(9003);
    expect(kinds).toContain(9005);

    const put = fake.state.published.find((e) => e.kind === 9000);
    expect(put?.tags).toContainEqual(['h', 'grpA']);
    // p-tag carries optional roles after the pubkey
    const pTag = put?.tags.find((t) => t[0] === 'p');
    expect(pTag?.[1]).toBe(target.pkHex);
    expect(pTag?.[2]).toBe('admin');

    const remPerm = fake.state.published.find((e) => e.kind === 9003);
    expect(remPerm?.tags).toContainEqual(['h', 'grpA']);
    const permTag = remPerm?.tags.find((t) => t[0] === 'p');
    expect(permTag?.[1]).toBe(target.pkHex);
    expect(permTag?.[2]).toBe('admin');

    const del = fake.state.published.find((e) => e.kind === 9005);
    expect(del?.tags).toContainEqual(['e', 'evt-deadbeef']);
  });

  it('claimCreatorAdmin no-ops when the active user is not the kind 9007 author', async () => {
    const { getBridge, getBridgeImpl } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const otherCreator = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    // Seed the creators map with somebody else.
    getBridgeImpl()!.groupCreators.update((m) => ({ ...m, grpX: otherCreator.pkHex }));

    fake.state.published = [];
    const published = await bridge.claimCreatorAdmin('grpX');
    await flush();

    expect(published).toBe(false);
    expect(fake.state.published.filter((e) => e.kind === 9000)).toHaveLength(0);
  });

  it('claimCreatorAdmin no-ops when the user is already in the 39001 admin list', async () => {
    const { getBridge, getBridgeImpl } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    const impl = getBridgeImpl()!;
    impl.groupCreators.update((m) => ({ ...m, grpY: pkHex }));
    impl.adminsByGroup.update((m) => ({ ...m, grpY: [pkHex] }));

    fake.state.published = [];
    const published = await bridge.claimCreatorAdmin('grpY');
    await flush();

    expect(published).toBe(false);
    expect(fake.state.published.filter((e) => e.kind === 9000)).toHaveLength(0);
  });

  it('claimCreatorAdmin publishes one kind 9000 admin when creator and not yet listed', async () => {
    const { getBridge, getBridgeImpl } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    const impl = getBridgeImpl()!;
    impl.groupCreators.update((m) => ({ ...m, grpZ: pkHex }));
    // 39001 has not yet been delivered → adminsByGroup['grpZ'] is empty.

    fake.state.published = [];
    const published = await bridge.claimCreatorAdmin('grpZ');
    await flush();

    expect(published).toBe(true);
    const claims = fake.state.published.filter((e) => e.kind === 9000);
    expect(claims).toHaveLength(1);
    expect(claims[0].tags).toContainEqual(['h', 'grpZ']);
    const pTag = claims[0].tags.find((t) => t[0] === 'p');
    expect(pTag?.[1]).toBe(pkHex);
    expect(pTag?.[2]).toBe('admin');
  });

  it('createGroup no longer publishes a kind 9000 self-claim (lazy claim only)', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    fake.state.published = [];
    await bridge.createGroup({ name: 'Spam-free', isPublic: true, isOpen: true });
    await flush();

    expect(fake.state.published.filter((e) => e.kind === 9000)).toHaveLength(0);
    expect(fake.state.published.find((e) => e.kind === 9007)).toBeTruthy();
    expect(fake.state.published.find((e) => e.kind === 9002)).toBeTruthy();
  });

  it('subscribeMyMutes parses NIP-51 kind 10000 p-tags for the local user', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const muted1 = makeKeypair();
    const muted2 = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const seen: ReadonlyArray<string>[] = [];
    bridge.subscribeMyMutes((l) => seen.push(l));

    const muteEvent = await finalizeEvent(
      {
        kind: 10000,
        content: '',
        tags: [['p', muted1.pkHex], ['p', muted2.pkHex]],
        created_at: Math.floor(Date.now() / 1000),
        pubkey: pkHex,
      } as Parameters<typeof finalizeEvent>[0],
      // sign with the local user's key — the relay would accept any author,
      // but the bridge filters by `authors: [me]`.
      Uint8Array.from(skHex.match(/.{2}/g)!.map((h) => parseInt(h, 16))),
    );
    deliver(muteEvent);
    await flush();

    expect(seen.at(-1)).toEqual([muted1.pkHex, muted2.pkHex]);
  });

  it('subscribeAdmins / subscribeMembers parse 39001/39002 p-tags', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const a = makeKeypair();
    const b = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const adminsSeen: ReadonlyArray<string>[] = [];
    const membersSeen: ReadonlyArray<string>[] = [];
    bridge.subscribeAdmins('grpZ', (l) => adminsSeen.push(l));
    bridge.subscribeMembers('grpZ', (l) => membersSeen.push(l));

    deliver(await fakeRelayList({ groupId: 'grpZ', kind: 39001, pubkeys: [a.pkHex] }));
    deliver(await fakeRelayList({ groupId: 'grpZ', kind: 39002, pubkeys: [a.pkHex, b.pkHex] }));
    await flush();

    expect(adminsSeen.at(-1)).toEqual([a.pkHex]);
    expect(membersSeen.at(-1)).toEqual([a.pkHex, b.pkHex]);
  });

  it('createGroup with parent emits a [parent,id] tag on the kind 9002 metadata', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const childId = await bridge.createGroup({
      name: 'My thread',
      isPublic: true,
      isOpen: true,
      parent: 'forum-container-1',
    });
    await flush();

    const meta = fake.state.published.find(
      (e) => e.kind === 9002 && e.tags.some((t) => t[0] === 'h' && t[1] === childId),
    );
    expect(meta).toBeTruthy();
    expect(meta?.tags).toContainEqual(['parent', 'forum-container-1']);
  });

  it('group with [t,forum] metadata is parsed as kind=forum', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const groupsSeen: ReadonlyArray<{ id: string; kind: string }>[] = [];
    bridge.subscribeGroups((g) => groupsSeen.push(g.map((x) => ({ id: x.id, kind: x.kind }))));

    deliver(await fakeRelayMetadata({ groupId: 'g-text', name: 'T' }));
    deliver(await fakeRelayMetadataWithT({ groupId: 'g-forum', name: 'F', t: 'forum' }));
    deliver(await fakeRelayMetadataWithT({ groupId: 'g-voice', name: 'V', t: 'voice' }));
    await flush();

    const last = groupsSeen.at(-1) as { id: string; kind: string }[];
    expect(last.find((g) => g.id === 'g-text')?.kind).toBe('text');
    expect(last.find((g) => g.id === 'g-forum')?.kind).toBe('forum');
    expect(last.find((g) => g.id === 'g-voice')?.kind).toBe('voice');
  });

  it('child group nesting populates childrenByParent', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const observed: Record<string, ReadonlyArray<string>>[] = [];
    bridge.subscribeChildrenByParent((m) => observed.push({ ...m }));

    deliver(await fakeRelayMetadata({ groupId: 'parent1', name: 'Parent' }));
    deliver(await fakeRelayMetadata({ groupId: 'child1', name: 'Child', parent: 'parent1' }));
    await flush();

    const last = observed.at(-1) as Record<string, ReadonlyArray<string>>;
    expect(last.parent1).toContain('child1');
  });

  it('relayAccess flips to ok on event/EOSE and stays ok across per-sub CLOSED reasons', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const observed: Array<Record<string, string>> = [];
    bridge.subscribeRelayAccess((m) => observed.push({ ...(m as Record<string, string>) }));

    // EOSE fires from FakePool's subscribe via queueMicrotask — that should
    // flip the active relay to 'ok'.
    await flush();
    const activeRelay = (await import('./client')).getBridgeImpl()!['relays'][0];
    const norm = activeRelay.replace(/\/+$/, '').toLowerCase();
    expect(observed.at(-1)?.[norm]).toBe('ok');

    // Once 'ok' has been confirmed (relay is reading us), per-sub CLOSED
    // rejections must NOT downgrade the access state. They normally come
    // from a private channel the user isn't in, a NIP-29 membership race,
    // or an AUTH challenge that resolves a moment later — none of which
    // mean the relay has stopped serving us. Without this guard the
    // "Not whitelisted" banner gets stuck on for users who actually are
    // whitelisted.
    for (const sub of fake.state.subscriptions) {
      const reasons = (sub.relays ?? [activeRelay]).map(() => 'auth-required: please AUTH');
      sub.onclose?.(reasons);
    }
    await flush();
    expect(observed.at(-1)?.[norm]).toBe('ok');

    for (const sub of fake.state.subscriptions) {
      const reasons = (sub.relays ?? [activeRelay]).map(() => 'restricted: pubkey not whitelisted');
      sub.onclose?.(reasons);
    }
    await flush();
    expect(observed.at(-1)?.[norm]).toBe('ok');
  });

  // -- subscribeWatched EOSE-then-CLOSED race --------------------------------
  // Some relays send EOSE (empty result) immediately, then CLOSED auth-required
  // because NIP-42 AUTH didn't complete before the REQ landed. The previous
  // implementation marked the sub `alive` on EOSE and disabled the watchdog,
  // so the subsequent CLOSED killed the sub permanently — symptom: messages
  // and member metadata don't render until the user refreshes the page.
  // The fix retries the sub when CLOSED carries an auth/restricted reason,
  // regardless of whether EOSE already fired.

  it('retries a sub when CLOSED auth-required arrives after EOSE', async () => {
    const { getBridge } = await import('./client');
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
    // alive=true but armed=true (per the fix) — the bug condition.
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

  it('does NOT retry a sub when CLOSED carries no auth/restricted reason', async () => {
    const { getBridge } = await import('./client');
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
      // Operator-clean close — empty reason. parseRelayRejection returns null,
      // so the new path must not retry. Pre-fix behavior is preserved.
      firstSub.onclose?.((firstSub.relays ?? ['']).map(() => ''));
      // Advance well past the immediate-retry window and the watchdog. With
      // alive=true (EOSE fired earlier) the watchdog must not fire either.
      await vi.advanceTimersByTimeAsync(10_000);
    } finally {
      vi.useRealTimers();
    }
    await flush();

    // Same sub object, no replacement. (The original wasn't closed because
    // we never called activeSub.close().)
    const subsAfter = findMessageSubs();
    expect(subsAfter).toHaveLength(1);
    expect(subsAfter[0]).toBe(firstSub);
  });

  it('does not flash the relay-access banner on transient auth-required CLOSED', async () => {
    const { getBridge, getBridgeImpl } = await import('./client');
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
    // so by `await flush()` the state is already 'ok' — sticky-OK would
    // otherwise mask the deferred-soak path entirely.)
    (impl as unknown as { relayAccess: { set: (v: Record<string, unknown>) => void } }).relayAccess.set({});

    const observed: Array<string | undefined> = [];
    bridge.subscribeRelayAccess((m) =>
      observed.push((m as Record<string, string>)[norm]),
    );

    // Fire CLOSED auth-required on every active sub. Without the soak guard
    // the banner state would flip to 'auth-required' immediately for each
    // sub. With the guard, the downgrade is deferred and the retry path
    // gets a chance to heal it back to 'ok' first.
    for (const sub of fake.state.subscriptions) {
      const reasons = (sub.relays ?? [activeRelay]).map(() => 'auth-required: please AUTH');
      sub.onclose?.(reasons);
    }
    await flush();

    expect(observed).not.toContain('auth-required');
    expect(observed).not.toContain('restricted');
  });

  it('schedules at most one retry when CLOSED auth-required fires twice', async () => {
    const { getBridge } = await import('./client');
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
      // Fire CLOSED twice in a row — both calls hit scheduleRetry but the
      // `armed` token disarms after the first, so the second is a no-op.
      firstSub.onclose?.(reasons);
      firstSub.onclose?.(reasons);
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
    await flush();

    // Exactly one retry sub — not two.
    const subsAfter = findMessageSubs();
    expect(subsAfter).toHaveLength(1);
    expect(subsAfter[0]).not.toBe(firstSub);
  });
});

// -- helpers ------------------------------------------------------------

async function fakeRelayMetadata(opts: {
  groupId: string;
  name?: string;
  about?: string;
  parent?: string;
  isPublic?: boolean;
  isOpen?: boolean;
}): Promise<NostrEvent> {
  // Sign with a throwaway key — the bridge doesn't verify authorship of
  // kind 39000, only parses tags.
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const tags: string[][] = [['d', opts.groupId]];
  if (opts.name) tags.push(['name', opts.name]);
  if (opts.about) tags.push(['about', opts.about]);
  if (opts.parent) tags.push(['parent', opts.parent]);
  if (opts.isPublic) tags.push(['public']);
  if (opts.isOpen) tags.push(['open']);
  return finalizeEvent(
    {
      kind: 39000,
      content: '',
      tags,
      created_at: Math.floor(Date.now() / 1000),
      pubkey: pk,
    } as Parameters<typeof finalizeEvent>[0],
    sk,
  );
}

async function fakeRelayMetadataWithT(opts: {
  groupId: string;
  name?: string;
  t: string;
}): Promise<NostrEvent> {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const tags: string[][] = [['d', opts.groupId], ['t', opts.t]];
  if (opts.name) tags.push(['name', opts.name]);
  return finalizeEvent(
    {
      kind: 39000,
      content: '',
      tags,
      created_at: Math.floor(Date.now() / 1000),
      pubkey: pk,
    } as Parameters<typeof finalizeEvent>[0],
    sk,
  );
}

async function fakeRelayList(opts: {
  groupId: string;
  kind: 39001 | 39002;
  pubkeys: string[];
}): Promise<NostrEvent> {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const tags: string[][] = [['d', opts.groupId], ...opts.pubkeys.map((pk) => ['p', pk])];
  return finalizeEvent(
    {
      kind: opts.kind,
      content: '',
      tags,
      created_at: Math.floor(Date.now() / 1000),
      pubkey: pk,
    } as Parameters<typeof finalizeEvent>[0],
    sk,
  );
}

function deliver(ev: NostrEvent) {
  for (const sub of fake.state.subscriptions) if (matches(sub.filter as Filter, ev)) sub.sink(ev);
}
