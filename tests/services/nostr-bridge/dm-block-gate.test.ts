/**
 * Blocked and muted senders must not reach the user through NIP-17.
 *
 * The WoT / mute / block gate at the subscription boundary keys on
 * `ev.pubkey`, which for a kind-1059 gift wrap is a throwaway key. The real
 * author is only known after `unwrapGiftWrap`, so `ingestIncomingGiftWrap`
 * re-applies the gate to `senderPubkey`. These tests feed wraps from blocked,
 * muted and ordinary senders and check the three things a blocked sender
 * could otherwise produce: a thread entry, a notification card, a chime. They
 * also pin the recovery property (the wrap is not written to the inert
 * ledger, so an accidental mute is undone by unmuting and reconnecting) and
 * the non-destructive property (blocking mid-thread keeps the history).
 *
 * Same FakePool shape as `dm-nip17.test.ts`: subscribe, publish, close,
 * ensureRelay, querySync.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { warmBridgeModules } from '@tests/support/warm-bridge-modules';
import { generateSecretKey, getPublicKey, type Event as NostrEvent } from 'nostr-tools';
import { unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';

const fake = vi.hoisted(() => {
  const state = {
    published: [] as NostrEvent[],
    subscriptions: [] as Array<{ filter: Record<string, unknown>; sink: (ev: NostrEvent) => void }>,
  };

  function matches(f: Record<string, unknown>, ev: { kind: number; pubkey: string; tags: string[][] }): boolean {
    if (Array.isArray(f.kinds) && !(f.kinds as number[]).includes(ev.kind)) return false;
    if (Array.isArray(f.authors) && !(f.authors as string[]).includes(ev.pubkey)) return false;
    for (const k of Object.keys(f)) {
      if (!k.startsWith('#')) continue;
      const wanted = f[k] as string[];
      if (!ev.tags.some((t) => t[0] === k.slice(1) && wanted.includes(t[1]))) return false;
    }
    return true;
  }

  /** A relay delivering `ev` to every live subscription whose filter matches. */
  function deliver(ev: NostrEvent): void {
    state.published.push(ev);
    for (const sub of state.subscriptions) if (matches(sub.filter, ev)) sub.sink(ev);
  }

  class FakePool {
    subscribe(
      _relays: string[],
      filter: Record<string, unknown>,
      opts: { onevent: (ev: NostrEvent) => void; oneose?: () => void },
    ) {
      const sub = { filter, sink: opts.onevent };
      state.subscriptions.push(sub);
      for (const ev of state.published) if (matches(filter, ev)) opts.onevent(ev);
      queueMicrotask(() => opts.oneose?.());
      return { close: () => { state.subscriptions = state.subscriptions.filter((s) => s !== sub); } };
    }
    publish(_relays: string[], event: NostrEvent): Promise<string>[] {
      queueMicrotask(() => deliver(event));
      return [Promise.resolve('ok')];
    }
    close(): void {
      state.subscriptions = [];
    }
    async ensureRelay(): Promise<{ connected: boolean }> {
      return { connected: true };
    }
    async querySync(_relays: string[], filter: Record<string, unknown>): Promise<NostrEvent[]> {
      return state.published.filter((ev) => matches(filter, ev));
    }
  }

  return { state, FakePool, deliver };
});

vi.mock('nostr-tools', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, SimplePool: fake.FakePool };
});

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}

function makeKeypair() {
  const sk = generateSecretKey();
  return { sk, skHex: bytesToHex(sk), pkHex: getPublicKey(sk) };
}

async function flush(times = 30) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/** Seal + wrap a chat rumor from `from` to `to`, as a foreign NIP-17 client would. */
async function chatWrap(from: ReturnType<typeof makeKeypair>, to: string, text: string): Promise<NostrEvent> {
  const { PrivateKeySigner } = await import('@nostr-wot/signers');
  const { buildChatMessage, sealAndGiftWrap } = await import('@nostr-wot/dm');
  return sealAndGiftWrap(new PrivateKeySigner(from.sk), to, buildChatMessage(from.pkHex, to, text));
}

type Thread = ReadonlyArray<{ content: string; outgoing: boolean }>;

/** Log `me` in, enable DMs and start watching `peer`'s thread. */
async function loginWatching(me: ReturnType<typeof makeKeypair>, peer: string) {
  const { getBridge, getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
  const { setPreference } = await import('@/services/preferences/preferences');
  const { useModerationStore } = await import('@/store/moderation');
  const { useNotificationsStore } = await import('@/store/notifications');
  const alert = await import('@/services/notifications/alert');
  const bridge = await getBridge();
  await bridge.loginWithNsec(me.skHex, me.pkHex);
  await bridge.unlockDirectMessages();
  setPreference('directMessagesEnabled', true);
  const announce = vi.spyOn(alert, 'announceIncoming');
  const view = { thread: [] as Thread, peers: [] as string[] };
  const subscribe = () => bridge.subscribeDirectMessages((byPeer) => {
    view.thread = byPeer[peer] ?? [];
    view.peers = Object.keys(byPeer);
  });
  return { bridge, impl: getBridgeImpl()!, moderation: useModerationStore, notifications: useNotificationsStore, announce, view, subscribe };
}

warmBridgeModules();

beforeEach(() => {
  fake.state.published = [];
  fake.state.subscriptions = [];
  // A fresh bridge per test: its globalThis slot survives the module reset,
  // so it is emptied here. The reset stays for the page RelayHub singleton and
  // the module-level stores the bridge writes to.
  unregisterBridge();
  vi.resetModules();
  window.localStorage.clear();
});

afterEach(async () => {
  const { getBridgeImpl } = await import('@/services/nostr-bridge/facade/client');
  getBridgeImpl()?.dispose();
  vi.restoreAllMocks();
  fake.state.published = [];
  fake.state.subscriptions = [];
});

describe('NIP-17 gift wraps from blocked and muted senders', () => {
  it('drops a blocked sender: no thread, no card, no chime, and nothing in the inert ledger', async () => {
    const alice = makeKeypair();
    const bob = makeKeypair();
    const wrap = await chatWrap(alice, bob.pkHex, 'you cannot block me');
    fake.state.published.push(wrap);

    const { moderation, notifications, announce, view, subscribe } = await loginWatching(bob, alice.pkHex);
    moderation.getState().toggleBlock(alice.pkHex);
    subscribe();
    await flush();

    expect(view.thread).toHaveLength(0);
    expect(view.peers).not.toContain(alice.pkHex);
    expect(notifications.getState().dmNotifications).toHaveLength(0);
    expect(announce).not.toHaveBeenCalled();
    // Recoverable: the wrap was not written off as inert, so unblocking and
    // reconnecting replays it. See the comment in `ingestIncomingGiftWrap`.
    const { hasSeenWrap } = await import('@/services/nostr-bridge/cache/wrap-ledger');
    expect(hasSeenWrap('dm:inert', wrap.id)).toBe(false);
  });

  it('drops a muted sender the same way', async () => {
    const alice = makeKeypair();
    const bob = makeKeypair();
    fake.state.published.push(await chatWrap(alice, bob.pkHex, 'muted but loud'));

    const { moderation, notifications, announce, view, subscribe } = await loginWatching(bob, alice.pkHex);
    moderation.getState().toggleMute(alice.pkHex);
    subscribe();
    await flush();

    expect(view.thread).toHaveLength(0);
    expect(notifications.getState().dmNotifications).toHaveLength(0);
    expect(announce).not.toHaveBeenCalled();
  });

  it('still delivers an ordinary sender: thread, card and chime (the fix is not "drop everything")', async () => {
    const alice = makeKeypair();
    const bob = makeKeypair();
    const wrap = await chatWrap(alice, bob.pkHex, 'hello bob');
    fake.state.published.push(wrap);

    const { notifications, announce, view, subscribe } = await loginWatching(bob, alice.pkHex);
    subscribe();
    await vi.waitFor(() => { if (view.thread.length === 0) throw new Error('not ingested'); }, { timeout: 3000, interval: 5 });

    expect(view.thread[0]).toMatchObject({ content: 'hello bob', outgoing: false });
    expect(notifications.getState().dmNotifications.map((n) => n.id)).toEqual([wrap.id]);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce.mock.calls[0][0]).toMatchObject({ kind: 'dm', id: wrap.id });
  });

  it('a message dropped while blocked reappears after unblocking and reconnecting', async () => {
    const alice = makeKeypair();
    const bob = makeKeypair();
    fake.state.published.push(await chatWrap(alice, bob.pkHex, 'sent while blocked'));

    const first = await loginWatching(bob, alice.pkHex);
    first.moderation.getState().toggleBlock(alice.pkHex);
    first.subscribe();
    await flush();
    expect(first.view.thread).toHaveLength(0);

    // Unblock, then a reload: fresh modules and a fresh bridge, same relay.
    first.moderation.getState().toggleBlock(alice.pkHex);
    first.impl.dispose();
    unregisterBridge();
    vi.resetModules();
    fake.state.subscriptions = [];
    const second = await loginWatching(bob, alice.pkHex);
    second.subscribe();
    await vi.waitFor(() => { if (second.view.thread.length === 0) throw new Error('not recovered'); }, { timeout: 3000, interval: 5 });
    expect(second.view.thread[0].content).toBe('sent while blocked');
  });

  it('blocking mid-thread keeps the history and stops new messages and their alerts', async () => {
    const alice = makeKeypair();
    const bob = makeKeypair();
    fake.state.published.push(await chatWrap(alice, bob.pkHex, 'before the block'));

    const { moderation, notifications, announce, view, subscribe } = await loginWatching(bob, alice.pkHex);
    subscribe();
    await vi.waitFor(() => { if (view.thread.length === 0) throw new Error('not ingested'); }, { timeout: 3000, interval: 5 });
    expect(notifications.getState().dmNotifications).toHaveLength(1);
    expect(announce).toHaveBeenCalledTimes(1);

    moderation.getState().toggleBlock(alice.pkHex);
    fake.deliver(await chatWrap(alice, bob.pkHex, 'after the block'));
    await flush();

    // Verdicts are non-destructive (see `wireWotEngine`): what was already
    // read stays, so the user keeps the context they blocked over.
    expect(view.thread.map((m) => m.content)).toEqual(['before the block']);
    expect(notifications.getState().dmNotifications).toHaveLength(1);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('a blocked sender cannot ring: the call rumor never reaches call listeners', async () => {
    const alice = makeKeypair();
    const bob = makeKeypair();
    const { PrivateKeySigner } = await import('@nostr-wot/signers');
    const { sealAndGiftWrap } = await import('@nostr-wot/dm');
    const now = Math.floor(Date.now() / 1000);
    const invite = {
      pubkey: alice.pkHex, kind: 25055, created_at: now - 1, tags: [['p', bob.pkHex]],
      content: JSON.stringify({ v: 1, type: 'invite', callId: 'c'.repeat(64), eph: 'e'.repeat(64), relays: ['wss://call.example'], video: false }),
    };
    fake.state.published.push(await sealAndGiftWrap(new PrivateKeySigner(alice.sk), bob.pkHex, invite));

    const { bridge, moderation, subscribe } = await loginWatching(bob, alice.pkHex);
    moderation.getState().toggleBlock(alice.pkHex);
    const got: unknown[] = [];
    bridge.subscribeDmCallMessages((m) => got.push(m));
    subscribe();
    await flush(60);

    expect(got).toHaveLength(0);
  });
});
