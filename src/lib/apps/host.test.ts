/**
 * The host is the only enforcement point between an untrusted app and the
 * user's signer, so these tests talk to it the way a hostile app would: raw
 * messages on the port, no SDK.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';

import { AppHost, BUCKET_SIZE, CONTENT_MAX_BYTES, STORAGE_MAX_BYTES, type AppHostDeps } from './host';
import { B, CH, HOST } from './test-helpers';

const SESSION = '5'.repeat(64);
const ADDRESS = `32390:${'f'.repeat(64)}:chain-reaction`;

class MemStore {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}

let open: AppHost[] = [];
afterEach(() => { open.forEach((h) => h.dispose()); open = []; });

function setup(over: Partial<AppHostDeps> = {}) {
  let ms = 0;
  const published: { kind: number; tags: string[][]; content: string }[] = [];
  const toasts: string[] = [];
  const close = vi.fn();
  const storage = new MemStore();
  const deps: AppHostDeps = {
    me: HOST,
    app: { address: ADDRESS, title: 'Chain Reaction', author: 'f'.repeat(64) },
    session: { id: SESSION, channelId: CH, createdBy: HOST, createdAt: 1000, channelName: 'general' },
    paths: [{ path: '/index.js', sha256: '1'.repeat(64) }, { path: '/music/a.mp3', sha256: '2'.repeat(64) }],
    locale: 'en',
    theme: { mode: 'dark', accent: '#b4f953' },
    connection: { connected: true, since: 0 },
    publish: async (t) => {
      published.push(t);
      return { ...t, id: String(published.length).padStart(64, '0'), pubkey: HOST, created_at: 2000, sig: 's' } as NostrEvent;
    },
    loadPath: async (p) => new Blob([p.path]),
    profile: async (pk) => ({ pubkey: pk, name: pk === B ? 'Bruno' : 'Host' }),
    storage,
    toast: (text) => toasts.push(text),
    close,
    clockMs: () => ms,
    ...over,
  };
  const host = new AppHost(deps);
  open.push(host);
  const { port1, port2 } = new MessageChannel();
  const inbox: Record<string, unknown>[] = [];
  port2.onmessage = (e) => inbox.push(e.data);
  host.attach(port1, [{ pubkey: HOST, name: 'Host' }], [
    { id: SESSION, pubkey: HOST, created_at: 1000, kind: 2390, tags: [['op', 'create']], content: '{}', sig: '' } as NostrEvent,
  ]);
  let nextId = 1;
  const call = async (type: string, body: Record<string, unknown> = {}) => {
    const id = nextId++;
    port2.postMessage({ id, type, ...body });
    for (let i = 0; i < 200; i++) {
      const res = inbox.find((m) => m.re === id);
      if (res) return res as { ok: boolean; error?: string; result?: unknown };
      await new Promise((r) => setTimeout(r, 1));
    }
    throw new Error(`no reply to ${type}`);
  };
  return { host, call, inbox, published, toasts, close, storage, port2, tick: (n: number) => { ms += n; } };
}

describe('AppHost', () => {
  it('sends init first, then the backlog, and nothing that reaches the relay or the signer', async () => {
    const { inbox } = setup();
    await new Promise((r) => setTimeout(r, 5));
    expect(inbox[0]).toMatchObject({ type: 'init', api: 1, me: HOST, session: { id: SESSION, channelName: 'general' } });
    expect(inbox[0]).toMatchObject({ paths: ['/index.js', '/music/a.mp3'] });
    expect(JSON.stringify(inbox[0])).not.toContain(CH); // no group id
    expect(JSON.stringify(inbox[0])).not.toMatch(/wss?:\/\//); // no relay URL
    expect(inbox[1]).toMatchObject({ type: 'events' });
  });

  describe('publish', () => {
    it('builds kind 2390 with host-fixed h, t, op, e and n', async () => {
      const { call, published } = setup();
      const res = await call('publish', { op: 'move', content: '{"n":0}', n: 0 });
      expect(res.ok).toBe(true);
      expect(published[0]).toEqual({
        kind: 2390,
        tags: [['h', CH], ['t', 'obelisk-app'], ['op', 'move'], ['e', SESSION, '', 'root'], ['n', '0']],
        content: '{"n":0}',
      });
    });

    it('ignores any kind or tags the app tries to pass', async () => {
      const { call, published } = setup();
      await call('publish', { op: 'move', kind: 1, tags: [['p', B]], content: '{}' });
      expect(published[0].kind).toBe(2390);
      expect(published[0].tags.some((t) => t[0] === 'p')).toBe(false);
    });

    it('refuses create and malformed op names', async () => {
      const { call, published } = setup();
      for (const op of ['create', 'Move', '1move', 'x'.repeat(33), '', 42]) {
        expect((await call('publish', { op })).error).toBe('forbidden-op');
      }
      expect(published).toHaveLength(0);
    });

    it('caps content and status lines, and checks n', async () => {
      const { call } = setup();
      expect((await call('publish', { op: 'move', content: 'x'.repeat(CONTENT_MAX_BYTES + 1) })).error).toBe('too-large');
      expect((await call('publish', { op: 'status', content: JSON.stringify({ text: 'x'.repeat(141) }) })).error).toBe('too-large');
      expect((await call('publish', { op: 'move', n: -1 })).error).toBe('bad-n');
      expect((await call('publish', { op: 'move', n: 1.5 })).error).toBe('bad-n');
      expect((await call('publish', { op: 'move', content: { not: 'a string' } })).error).toBe('bad-request');
    });

    it('holds a 20-deep token bucket that refills at 5 per second', async () => {
      const { call, tick } = setup();
      const results = [];
      for (let i = 0; i < BUCKET_SIZE + 1; i++) results.push((await call('publish', { op: 'ping' })).ok);
      expect(results.filter(Boolean)).toHaveLength(BUCKET_SIZE);
      expect(results[BUCKET_SIZE]).toBe(false);
      tick(1000);
      expect((await call('publish', { op: 'ping' })).ok).toBe(true);
    });

    it('refuses a signed-out spectator and reports a signer refusal', async () => {
      expect((await setup({ me: null }).call('publish', { op: 'join' })).error).toBe('signed-out');
      const { call } = setup({ publish: async () => { throw new Error('user rejected'); } });
      expect((await call('publish', { op: 'join' })).error).toBe('signer-rejected');
    });

    it('echoes the signed event into the app\'s event stream', async () => {
      const { call, inbox } = setup();
      await call('publish', { op: 'ping' });
      const pushes = inbox.filter((m) => m.type === 'events') as { events: NostrEvent[] }[];
      expect(pushes.at(-1)!.events[0].tags).toContainEqual(['op', 'ping']);
    });
  });

  it('serves only pinned paths', async () => {
    const { call } = setup();
    expect((await call('asset', { path: '/music/a.mp3' })).ok).toBe(true);
    expect((await call('asset', { path: '/etc/passwd' })).error).toBe('not-found');
    const { call: failing } = setup({ loadPath: async () => { throw new Error('404 everywhere'); } });
    expect((await failing('asset', { path: '/index.js' })).error).toBe('unavailable');
  });

  it('namespaces storage per app and user, and enforces the quota', async () => {
    const { call, storage } = setup();
    await call('storage.set', { key: 'keys', value: 'wasd' });
    expect(storage.getItem(`obelisk-dex/app-storage/${ADDRESS}/${HOST}/keys`)).toBe('wasd');
    expect((await call('storage.get', { key: 'keys' })).result).toBe('wasd');
    expect((await call('storage.set', { key: 'big', value: 'x'.repeat(STORAGE_MAX_BYTES) })).error).toBe('quota');
    await call('storage.set', { key: 'keys', value: null });
    expect((await call('storage.get', { key: 'keys' })).result).toBeNull();
  });

  it('resolves profiles only for pubkeys that authored an event in the session', async () => {
    const { host, call } = setup();
    let res = (await call('profiles', { pubkeys: [B] })).result as { name: string }[];
    expect(res[0].name).not.toBe('Bruno');
    host.pushEvents([{ id: '9'.repeat(64), pubkey: B, created_at: 1001, kind: 2390, tags: [], content: '', sig: '' } as NostrEvent]);
    res = (await call('profiles', { pubkeys: [B] })).result as { name: string }[];
    expect(res[0].name).toBe('Bruno');
  });

  it('prefixes toasts with the app title and rate-limits them', async () => {
    const { call, toasts, tick } = setup();
    await call('ui.toast', { text: 'Your turn' });
    expect(toasts).toEqual(['Chain Reaction: Your turn']);
    expect((await call('ui.toast', { text: 'again' })).error).toBe('rate-limited');
    tick(3000);
    expect((await call('ui.toast', { text: 'x'.repeat(500) })).ok).toBe(true);
    expect(toasts[1].length).toBe('Chain Reaction: '.length + 120);
  });

  it('drops malformed messages without replying, and answers unknown types with unsupported', async () => {
    const { call, inbox, port2 } = setup();
    port2.postMessage({ type: 'publish', op: 'move' }); // no id
    port2.postMessage('hello');
    port2.postMessage({ id: 1.5, type: 'publish' });
    expect((await call('sign_event', { kind: 1 })).error).toBe('unsupported');
    expect(inbox.filter((m) => 're' in m)).toHaveLength(1);
  });

  it('closes on request, and refuses everything after dispose', async () => {
    const { host, call, close } = setup();
    await call('ui.close');
    expect(close).toHaveBeenCalledTimes(1);
    host.dispose();
  });
});
