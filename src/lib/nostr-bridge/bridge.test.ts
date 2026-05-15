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
    published: [] as Array<{ kind: number; pubkey: string; tags: string[][]; content: string; id: string; relays?: string[] }>,
    subscriptions: [] as Array<{
      filter: Record<string, unknown>;
      sink: (ev: any) => void;
      relays?: string[];
      onclose?: (reasons: string[]) => void;
    }>,
    ensureRelayCalls: [] as string[],
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
    publish(relays: string[], event: any): Promise<string>[] {
      state.published.push({ ...event, relays });
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
      state.ensureRelayCalls.push(_url);
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
  (() => { fake.state.published = []; fake.state.subscriptions = []; fake.state.ensureRelayCalls = []; })();
  // Each test starts fresh — clear the bridge module-level singleton by
  // resetting modules so getBridge() returns a new instance.
  vi.resetModules();
  // Clear localStorage between tests so persisted sessions don't bleed.
  if (typeof window !== 'undefined') window.localStorage.clear();
});

afterEach(() => {
  (() => { fake.state.published = []; fake.state.subscriptions = []; fake.state.ensureRelayCalls = []; })();
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

  it('parses [forum-tag,id,name,emoji?] entries on kind 39000 into JsGroup.forumTags', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const seen: ReadonlyArray<ReadonlyArray<{ id: string; tags: ReadonlyArray<{ id: string; name: string; emoji: string | null }> }>> = [] as never;
    const observed: { id: string; tags: ReadonlyArray<{ id: string; name: string; emoji: string | null }> }[][] = [];
    bridge.subscribeGroups((g) =>
      observed.push(g.map((x) => ({ id: x.id, tags: x.forumTags }))),
    );
    void seen;

    // One forum tag with emoji, one without, plus a malformed entry that
    // must be silently dropped (missing name).
    deliver(
      await fakeRelayMetadataWithExtraTags({
        groupId: 'g-forum-with-tags',
        name: 'Plaza',
        extraTags: [
          ['t', 'forum'],
          ['forum-tag', 'tag-lacrypta', 'LaCrypta', '📜'],
          ['forum-tag', 'tag-trabajo', 'trabajo'],
          ['forum-tag', '', 'broken-no-id'],
          ['forum-tag', 'tag-empty-name', ''],
        ],
      }),
    );
    await flush();

    const last = observed.at(-1) as { id: string; tags: ReadonlyArray<{ id: string; name: string; emoji: string | null }> }[];
    const forum = last.find((g) => g.id === 'g-forum-with-tags');
    expect(forum).toBeTruthy();
    expect(forum?.tags).toEqual([
      { id: 'tag-lacrypta', name: 'LaCrypta', emoji: '📜' },
      { id: 'tag-trabajo', name: 'trabajo', emoji: null },
    ]);
  });

  it('parses [topic,id] entries on kind 39000 into JsGroup.topics, de-duped', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const observed: { id: string; topics: ReadonlyArray<string> }[][] = [];
    bridge.subscribeGroups((g) => observed.push(g.map((x) => ({ id: x.id, topics: x.topics }))));

    deliver(
      await fakeRelayMetadataWithExtraTags({
        groupId: 'thread-1',
        name: 'a thread',
        parent: 'forum-1',
        extraTags: [
          ['topic', 'tag-a'],
          ['topic', 'tag-b'],
          ['topic', 'tag-a'], // duplicate — must be de-duped
          ['topic', ''], // empty — dropped
        ],
      }),
    );
    await flush();

    const last = observed.at(-1) as { id: string; topics: ReadonlyArray<string> }[];
    const t = last.find((g) => g.id === 'thread-1');
    expect(t?.topics).toEqual(['tag-a', 'tag-b']);
  });

  it('createGroup with topics emits one [topic,id] tag per entry on kind 9002', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const childId = await bridge.createGroup({
      name: 'tagged thread',
      isPublic: true,
      isOpen: true,
      parent: 'forum-1',
      topics: ['tag-a', 'tag-b'],
    });
    await flush();

    const meta = fake.state.published.find(
      (e) => e.kind === 9002 && e.tags.some((t) => t[0] === 'h' && t[1] === childId),
    );
    expect(meta).toBeTruthy();
    expect(meta?.tags).toContainEqual(['topic', 'tag-a']);
    expect(meta?.tags).toContainEqual(['topic', 'tag-b']);
  });

  it('editGroupMetadata with forumTags emits [forum-tag,id,name,emoji?] for each entry', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    await bridge.editGroupMetadata({
      groupId: 'forum-edit-1',
      name: 'Plaza',
      kind: 'forum',
      forumTags: [
        { id: 'tag-1', name: 'LaCrypta', emoji: '📜' },
        { id: 'tag-2', name: 'no-emoji', emoji: null },
        // Bad entry: empty name. editGroupMetadata's tag emitter drops these.
        { id: 'tag-3', name: '', emoji: '🙃' },
      ],
    });
    await flush();

    const meta = fake.state.published.find(
      (e) => e.kind === 9002 && e.tags.some((t) => t[0] === 'h' && t[1] === 'forum-edit-1'),
    );
    expect(meta).toBeTruthy();
    expect(meta?.tags).toContainEqual(['forum-tag', 'tag-1', 'LaCrypta', '📜']);
    expect(meta?.tags).toContainEqual(['forum-tag', 'tag-2', 'no-emoji']);
    // Bad entry must NOT show up.
    const bad = meta?.tags.find((t) => t[0] === 'forum-tag' && t[1] === 'tag-3');
    expect(bad).toBeUndefined();
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
    for (const sub of fake.state.subscriptions) {
      if (isPreflight(sub)) continue;
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

  it('drops events delivered to a markClosed sub after switchRelay (no cross-relay bleed)', async () => {
    // Reproduces the user-reported "channels from another relay leaking into
    // Uncategorized" bug. switchRelay markCloses the previous relay's subs
    // but deliberately does NOT call pool.close() on the old WebSockets
    // (avoids per-sub CLOSING/CLOSED console spam — see
    // resetPoolForSessionChange comment). The old sockets stay alive until
    // GC and can still deliver events. Without the closed-guard in
    // subscribeWatched.onevent, those late events would be ingested into the
    // post-switch state — both polluting `this.groups` and writing the old
    // relay's group under the new relay's cache key (since
    // `cacheSet(this.currentRelayUrl.get(), ...)` uses whichever relay is
    // currently active).
    const { getBridge, getBridgeImpl } = await import('./client');
    const { cacheGet } = await import('./cache');
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

  // -- per-group messages-EOSE flag ----------------------------------------
  // The chat pane needs to tell "still loading from relay" from "relay
  // confirmed empty" so the loading spinner doesn't flash to "No messages
  // yet — be the first" mid-stream. The bridge exposes a per-group flag
  // (StateStore<Record<groupId, boolean>>) that flips on EOSE for the
  // kind 9 subscription scoped to that group.

  it('subscribeMessagesEose stays false until EOSE, flips to true after EOSE', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const groupId = 'eose-test-group';
    const observed: boolean[] = [];
    bridge.subscribeMessagesEose(groupId, (eose) => observed.push(eose));
    // Initial replay: false (no EOSE yet for this group).
    expect(observed[0]).toBe(false);

    // FakePool fires EOSE via queueMicrotask, so flush() lets it land.
    await flush();
    expect(observed.at(-1)).toBe(true);
  });

  it('messagesEoseByGroup resets on relay switch so the new relay starts in loading state', async () => {
    const { getBridge, getBridgeImpl } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const groupId = 'eose-reset-test';
    bridge.subscribeMessagesEose(groupId, () => {});
    await flush();

    const impl = getBridgeImpl()!;
    expect(impl.messagesEoseByGroup.get()[groupId]).toBe(true);

    await bridge.switchRelay('wss://other-relay.example');
    expect(impl.messagesEoseByGroup.get()[groupId]).toBeFalsy();
  });

  // -- active-group priority for kind 9 REQs ------------------------------
  // Background fan-out from kind 39000 used to fire a kind 9 REQ per
  // discovered group on the same tick — on a busy relay the channel the
  // user actually clicked landed at the back of the response queue and
  // its history rendered late. The bridge now queues background subs and
  // fast-tracks the active group via `setActiveGroup` so the channel in
  // view always wins the relay's first response.

  it('background metadata defers per-group message REQs; setActiveGroup fires the active one immediately', async () => {
    const { getBridge } = await import('./client');
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
      // the same tick — mirrors what a real relay does at login.
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

  it('setActiveGroup after a queued metadata burst promotes the clicked channel to the head of the queue', async () => {
    const { getBridge } = await import('./client');
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
      // Metadata arrives first — every group is queued (no active group yet).
      deliver(await fakeRelayMetadata({ groupId: 'bg-a', name: 'A' }));
      deliver(await fakeRelayMetadata({ groupId: 'bg-b', name: 'B' }));
      deliver(await fakeRelayMetadata({ groupId: 'bg-c', name: 'C' }));

      // No subs yet — queue waiting for the drain timer.
      expect(messageSubsFor('bg-a')).toHaveLength(0);
      expect(messageSubsFor('bg-b')).toHaveLength(0);
      expect(messageSubsFor('bg-c')).toHaveLength(0);

      // User clicks on bg-c — it should fire synchronously even though it's
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

  it('addRelay registers a relay in the rail without subscribing to it (no multi-relay bleed)', async () => {
    // Reproduces the second leak path: addRelay used to push the new URL
    // into `this.relays`, the bridge's active subscription set. A subsequent
    // background reconnect (`reconnectInBackground` → `connect()`) would
    // then issue kind 39000 against every relay the user had ever added,
    // mixing channels from multiple servers into one `this.groups` store.
    // The rail UX has only one active relay at a time (the green pill), so
    // `addRelay` should only register in `configuredRelays` — `switchRelay`
    // is the single path that activates a relay.
    const { getBridge, getBridgeImpl } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    const impl = getBridgeImpl()!;
    const activeBefore = (impl as unknown as { relays: string[] }).relays.slice();
    expect(activeBefore).toEqual(['wss://public.obelisk.ar']);

    const NEW_RELAY = 'wss://added-but-not-active.example';
    await bridge.addRelay(NEW_RELAY);

    // Active subscription set unchanged — only `switchRelay` should mutate it.
    const activeAfter = (impl as unknown as { relays: string[] }).relays.slice();
    expect(activeAfter).toEqual(activeBefore);
    expect(activeAfter).not.toContain(NEW_RELAY);

    // But the rail (configuredRelays) does include the new relay.
    expect(impl.configuredRelays.get()).toContain(NEW_RELAY);
  });

  it('addRelay persists a custom relay without preflight handshaking it', async () => {
    const { getBridge, getBridgeImpl } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();
    fake.state.ensureRelayCalls = [];

    const CUSTOM_RELAY = 'wss://custom-relay.example';
    await bridge.addRelay(CUSTOM_RELAY);

    const impl = getBridgeImpl()!;
    expect(impl.configuredRelays.get()).toContain(CUSTOM_RELAY);
    expect(fake.state.ensureRelayCalls).toEqual([]);
  });

  it('addRelay deduplicates equivalent relay URLs with and without a trailing slash', async () => {
    const { getBridge, getBridgeImpl } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    await bridge.addRelay('wss://lacrypta-relay.obelisk.ar/');
    await bridge.addRelay('wss://lacrypta-relay.obelisk.ar');

    const impl = getBridgeImpl()!;
    expect(impl.configuredRelays.get().filter((url) => url === 'wss://lacrypta-relay.obelisk.ar')).toHaveLength(1);
    expect(impl.configuredRelays.get()).not.toContain('wss://lacrypta-relay.obelisk.ar/');
  });

  it('editUserMetadata publishes kind 0 to the active relay plus profile relays', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);
    await flush();

    await bridge.switchRelay('wss://lacrypta-relay.obelisk.ar');
    fake.state.published = [];

    await bridge.editUserMetadata({ name: 'Alice', displayName: 'Alice' });

    const metadataEvent = fake.state.published.find((event) => event.kind === 0);
    expect(metadataEvent).toBeTruthy();
    expect(metadataEvent?.relays).toContain('wss://relay.damus.io');
    expect(metadataEvent?.relays).toContain('wss://lacrypta-relay.obelisk.ar');
  });

  // -- per-group messages-status confidence + retry ladder ----------------
  // EOSE alone is NOT proof a channel is empty: auth-gated and silent-
  // filtering relays routinely send EOSE-empty before any events arrive.
  // The bridge owns a retry ladder (see `EMPTY_RETRY_DELAYS` in client.ts)
  // that re-fires the kind 9 REQ a few times before promoting to
  // `empty-confirmed`. The UI reads `messagesStatusByGroup` to decide
  // between the loading spinner and "No messages yet" copy.

  it('subscribeMessagesStatus: starts at "loading", flips to "empty-unconfirmed" after empty EOSE', async () => {
    const { getBridge } = await import('./client');
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
    const { getBridge, getBridgeImpl } = await import('./client');
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
    expect(impl.messagesRetryByGroup.has(groupId)).toBe(true);

    // Simulate the auth-gated relay finally delivering a real event after
    // its EOSE-empty head-fake.
    deliver(await fakeRelayMessage({ groupId, content: 'late history msg' }));
    await flush();

    expect(impl.messagesStatusByGroup.get()[groupId]).toBe('has-messages');
    // Retry was cancelled so we don't fire a needless restart.
    expect(impl.messagesRetryByGroup.has(groupId)).toBe(false);
  });

  it('exhausting the retry ladder (3 retries) promotes status to "empty-confirmed"', async () => {
    const { getBridge, getBridgeImpl } = await import('./client');
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
      expect(impl.messagesRetryByGroup.has(groupId)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('setActiveGroup on an "empty-confirmed" channel restarts the sub and resets confidence to "loading"', async () => {
    const { getBridge, getBridgeImpl } = await import('./client');
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

      // User now opens this channel — bridge must restart the sub so a
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
    const { getBridge, getBridgeImpl } = await import('./client');
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
      expect(impl.messagesRetryByGroup.get(groupId)?.attempts).toBe(1);

      // External refresh: must reset attempts to 0 and reopen the sub.
      bridge.refreshGroupMessages(groupId);
      // Synchronously: retry tracking was cleared (no entry until next
      // empty EOSE schedules a fresh ladder).
      expect(impl.messagesRetryByGroup.has(groupId)).toBe(false);
      // Status is 'loading' until the fresh EOSE microtask drains.
      expect(impl.messagesStatusByGroup.get()[groupId]).toBe('loading');
    } finally {
      vi.useRealTimers();
    }
  });

  it('background message-queue drain is gated by the active channel reaching its first EOSE / event', async () => {
    const { getBridge, getBridgeImpl } = await import('./client');
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

    // — synchronous block — no awaits! —
    bridge.setActiveGroup('watched-grp');
    deliver(bgAEvent);
    deliver(bgBEvent);

    // Synchronously: only watched sub exists. bg subs are queued but
    // the drain timer was NOT armed — `isActiveGroupStillLoading()` saw
    // status='loading' on the active group and bailed.
    expect(subsFor('watched-grp')).toHaveLength(1);
    expect(subsFor('bg-a')).toHaveLength(0);
    expect(subsFor('bg-b')).toHaveLength(0);
    expect(impl.messagesStatusByGroup.get()['watched-grp']).toBe('loading');
    // — end synchronous block —

    // Now allow microtasks to drain (EOSE for watched fires → status
    // flips off 'loading' → maybeResumeMessageQueueDrain arms the 80ms
    // drain timer).
    await flush();
    await new Promise((r) => setTimeout(r, 150));
    expect(subsFor('bg-a')).toHaveLength(1);
    expect(subsFor('bg-b')).toHaveLength(1);
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

async function fakeRelayMetadataWithExtraTags(opts: {
  groupId: string;
  name?: string;
  parent?: string;
  extraTags: string[][];
}): Promise<NostrEvent> {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const tags: string[][] = [['d', opts.groupId]];
  if (opts.name) tags.push(['name', opts.name]);
  if (opts.parent) tags.push(['parent', opts.parent]);
  for (const t of opts.extraTags) tags.push(t);
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

async function fakeRelayMessage(opts: {
  groupId: string;
  content: string;
}): Promise<NostrEvent> {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  return finalizeEvent(
    {
      kind: 9,
      content: opts.content,
      tags: [['h', opts.groupId]],
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
