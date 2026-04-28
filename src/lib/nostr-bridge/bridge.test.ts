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
    subscriptions: [] as Array<{ filter: Record<string, unknown>; sink: (ev: any) => void }>,
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
    subscribe(_relays: string[], filter: Record<string, unknown>, opts: { onevent: (ev: any) => void }) {
      const sub = { filter, sink: opts.onevent };
      state.subscriptions.push(sub);
      for (const ev of state.published) if (matchesInternal(filter, ev as any)) opts.onevent(ev);
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

  it('putUser, removeUser, deleteGroupEvent publish the right NIP-29 kinds', async () => {
    const { getBridge } = await import('./client');
    const { skHex, pkHex } = makeKeypair();
    const target = makeKeypair();
    const bridge = await getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    await bridge.putUser('grpA', target.pkHex, ['admin']);
    await bridge.removeUser('grpA', target.pkHex);
    await bridge.deleteGroupEvent('grpA', 'evt-deadbeef');
    await flush();

    const kinds = fake.state.published.map((e) => e.kind).sort();
    expect(kinds).toContain(9000);
    expect(kinds).toContain(9001);
    expect(kinds).toContain(9005);

    const put = fake.state.published.find((e) => e.kind === 9000);
    expect(put?.tags).toContainEqual(['h', 'grpA']);
    // p-tag carries optional roles after the pubkey
    const pTag = put?.tags.find((t) => t[0] === 'p');
    expect(pTag?.[1]).toBe(target.pkHex);
    expect(pTag?.[2]).toBe('admin');

    const del = fake.state.published.find((e) => e.kind === 9005);
    expect(del?.tags).toContainEqual(['e', 'evt-deadbeef']);
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
  for (const sub of fake.state.subscriptions) if (matches(sub.filter, ev)) sub.sink(ev);
}
