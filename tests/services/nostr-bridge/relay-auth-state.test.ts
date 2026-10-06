/**
 * Regression tests for the NIP-42 `'authenticating'` relay-access state.
 *
 * The bug these guard against: after login the bridge could paint cached
 * relay-scoped state (groups, members, messages) before the relay had
 * confirmed AUTH, so users saw "channels with zero messages" until they
 * pressed F5. The fix surfaces the in-flight AUTH as a distinct relay-
 * access state so the UI can gate cached data on a positive AUTH signal.
 *
 * Covered:
 *   1. The `automaticallyAuth` callback flips relay-access to
 *      `'authenticating'` synchronously when the relay challenges us.
 *   2. A successful read on the relay (event delivered) flips it to
 *      `'ok'` and clears the in-flight state.
 *   3. Sticky-OK guard: once the relay is `'ok'`, a later AUTH challenge
 *      does NOT downgrade to `'authenticating'`.
 *   4. CLOSED `auth-required` after `'authenticating'` flips to
 *      `'auth-required'` once the soak window elapses (so the banner
 *      surfaces a real AUTH failure, not a transient race).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { warmBridgeModules } from '@tests/support/warm-bridge-modules';
import { finalizeEvent, generateSecretKey, getPublicKey, type Event as NostrEvent } from 'nostr-tools';
import { normalizeURL } from 'nostr-tools/utils';
import { unregisterBridge } from '@/services/nostr-bridge/bridge-slot';

const fake = vi.hoisted(() => {
  const state = {
    pools: [] as Array<{
      authHandler: ((relayUrl: string) => ((evt: any) => Promise<any>) | null) | null;
    }>,
    published: [] as NostrEvent[],
    subscriptions: [] as Array<{
      filter: Record<string, unknown>;
      sink: (ev: NostrEvent) => void;
      relays: string[];
      onclose?: (reasons: string[]) => void;
      oneose?: () => void;
    }>,
  };

  function matches(f: Record<string, unknown>, ev: { kind: number; pubkey: string; tags: string[][] }): boolean {
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

  /**
   * Stand-in for `nostr-tools` `SimplePool` that captures the
   * `automaticallyAuth` callback so tests can simulate a NIP-42 AUTH
   * challenge by invoking it directly with the active relay URL.
   *
   * Deliberately does NOT auto-fire EOSE. The real watchdog uses EOSE/
   * onevent to flip relays to `'ok'`; auto-firing would race past the
   * `'authenticating'` window we're trying to observe. Tests drive
   * deliveries explicitly via `state.published` + `sub.sink`.
   */
  class FakePool {
    authHandler: ((relayUrl: string) => ((evt: any) => Promise<any>) | null) | null = null;

    constructor(opts?: any) {
      this.authHandler = opts?.automaticallyAuth ?? null;
      state.pools.push(this);
    }

    subscribe(
      relays: string[],
      filter: Record<string, unknown>,
      opts: {
        onevent: (ev: NostrEvent) => void;
        oneose?: () => void;
        onclose?: (reasons: string[]) => void;
        onauth?: unknown;
      },
    ) {
      const sub = {
        filter,
        sink: opts.onevent,
        relays,
        onclose: opts.onclose,
        oneose: opts.oneose,
      };
      state.subscriptions.push(sub);
      for (const ev of state.published) if (matches(filter, ev)) opts.onevent(ev);
      return {
        close: () => {
          state.subscriptions = state.subscriptions.filter((s) => s !== sub);
        },
      };
    }

    publish(_relays: string[], event: NostrEvent): Promise<string>[] {
      state.published.push(event);
      queueMicrotask(() => {
        for (const sub of state.subscriptions) if (matches(sub.filter, event)) sub.sink(event);
      });
      return [Promise.resolve('ok')];
    }

    close(_relays: string[]): void {
      state.subscriptions = [];
    }

    async ensureRelay(_url: string, _opts?: { connectionTimeout?: number }) {
      return { connected: true };
    }
    async querySync(_relays: string[], filter: Record<string, unknown>, _opts?: { maxWait?: number }): Promise<NostrEvent[]> {
      return state.published.filter((ev) => matches(filter, ev));
    }
  }

  return { state, FakePool, matches };
});

vi.mock('nostr-tools', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, SimplePool: fake.FakePool };
});

function makeKeypair() {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const skHex = Array.from(sk).map((x) => x.toString(16).padStart(2, '0')).join('');
  return { skHex, pkHex: pk };
}

function normalizeRelayUrl(u: string): string {
  return u.replace(/\/+$/, '').toLowerCase();
}

/**
 * The template nostr-tools builds for a NIP-42 challenge (`makeAuthEvent`):
 * the relay and the challenge tags are what the hub keys its AUTH record on,
 * so a fixture without them is not a challenge the hub will sign.
 */
function authChallenge(relay: string, challenge = 'c1', pubkey?: string) {
  return { kind: 22242, content: '', tags: [['relay', relay], ['challenge', challenge]], created_at: 1, ...(pubkey ? { pubkey } : {}) };
}

warmBridgeModules();

beforeEach(() => {
  fake.state.pools = [];
  fake.state.published = [];
  fake.state.subscriptions = [];
  // A fresh bridge per test: its globalThis slot survives the module reset,
  // so it is emptied here. The reset stays for the page RelayHub singleton and
  // the module-level stores the bridge writes to.
  unregisterBridge();
  vi.resetModules();
  if (typeof window !== 'undefined') window.localStorage.clear();
});

afterEach(() => {
  fake.state.pools = [];
  fake.state.published = [];
  fake.state.subscriptions = [];
  vi.useRealTimers();
});

describe('relay-access "authenticating" state', () => {
  it('flips to "authenticating" the moment the relay challenges AUTH', async () => {
    const clientMod = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await clientMod.getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const impl = clientMod.getBridgeImpl()!;
    const url = impl.currentRelayUrl.get();
    const key = normalizeRelayUrl(url);

    // No AUTH yet: relay starts unknown (no entry in the map).
    expect(impl.relayAccess.get()[key]).toBeUndefined();

    // The session pool is the hub's one pool for the session identity.
    const pool = fake.state.pools.at(-1)!;
    expect(pool.authHandler).not.toBeNull();

    // nostr-tools resolves automaticallyAuth(url) on every ensureRelay to
    // install the signer; the relay has not challenged anything yet, so
    // nothing is in flight and the state must not move.
    const signer = pool.authHandler!(url);
    expect(signer).not.toBeNull();
    expect(impl.relayAccess.get()[key]).toBeUndefined();

    // The relay sends AUTH: nostr-tools calls the installed signer with the
    // challenge. The bridge must surface the in-flight AUTH synchronously so
    // the sidebar/chat-panel gates can hide cached groups/messages BEFORE
    // any signer round-trip completes. (It used to flip when the pool merely
    // asked for a signer, which happens on every REQ with or without a
    // challenge; the hub reports the challenge actually being answered.)
    void signer!(authChallenge(url, 'c1', pkHex));
    expect(impl.relayAccess.get()[key]).toBe('authenticating');
  });

  it('deduplicates identical NIP-42 signature requests', async () => {
    const clientMod = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const sk = Uint8Array.from(skHex.match(/../g)!.map((byte) => parseInt(byte, 16)));
    const signEvent = vi.fn(async (template) => finalizeEvent({ ...template }, sk));
    Object.defineProperty(window, 'nostr', { configurable: true, value: { signEvent } });
    const bridge = await clientMod.getBridge();
    await bridge.loginWithNip07(pkHex);

    const pool = fake.state.pools.at(-1)!;
    const signer = pool.authHandler!(clientMod.getBridgeImpl()!.currentRelayUrl.get())!;
    // A real challenge carries the `challenge` tag; the hub keys its memo on
    // it (NIP-42 binds the signature to the challenge, not to created_at).
    const challenge = {
      kind: 22242,
      content: 'same challenge',
      tags: [['relay', 'wss://public.obelisk.ar'], ['challenge', 'same-challenge']],
      created_at: 1,
      pubkey: pkHex,
    };

    await Promise.all([signer(challenge), signer(challenge)]);

    expect(signEvent).toHaveBeenCalledTimes(1);
    expect(signEvent).toHaveBeenCalledWith({
      kind: 22242,
      content: 'same challenge',
      tags: [['relay', 'wss://public.obelisk.ar'], ['challenge', 'same-challenge']],
      created_at: 1,
    });
  });

  it('flips from "authenticating" to "ok" when the relay starts delivering events', async () => {
    const clientMod = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await clientMod.getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const impl = clientMod.getBridgeImpl()!;
    const url = impl.currentRelayUrl.get();
    const key = normalizeRelayUrl(url);

    const pool = fake.state.pools.at(-1)!;
    const signer = pool.authHandler!(url);

    // Sanity: the nsec signer can sign the AUTH challenge, this proves
    // the bridge didn't break the existing signer path.
    const signed = await signer!(authChallenge(url, 'c1', pkHex));
    expect((signed as any).sig).toBeTruthy();

    expect(impl.relayAccess.get()[key]).toBe('authenticating');

    // Deliver a kind 39000 group-metadata event matching the global
    // metadata sub. The bridge's onevent path calls
    // setRelayAccess(url, 'ok'), which is the proof-of-read flag.
    const ev: NostrEvent = {
      id: 'meta-1',
      pubkey: 'relay-pk',
      created_at: 1,
      kind: 39000,
      sig: '',
      content: '',
      tags: [['d', 'group-x'], ['name', 'X']],
    };
    fake.state.published.push(ev);
    for (const sub of fake.state.subscriptions) {
      if (fake.matches(sub.filter, ev)) sub.sink(ev);
    }

    expect(impl.relayAccess.get()[key]).toBe('ok');
  });

  it('sticky-OK: once the relay is "ok", a later AUTH challenge does not downgrade', async () => {
    const clientMod = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await clientMod.getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const impl = clientMod.getBridgeImpl()!;
    const url = impl.currentRelayUrl.get();
    const key = normalizeRelayUrl(url);

    // Move the relay to 'ok' first by delivering an event.
    const ev: NostrEvent = {
      id: 'meta-1',
      pubkey: 'relay-pk',
      created_at: 1,
      kind: 39000,
      sig: '',
      content: '',
      tags: [['d', 'group-x'], ['name', 'X']],
    };
    fake.state.published.push(ev);
    for (const sub of fake.state.subscriptions) {
      if (fake.matches(sub.filter, ev)) sub.sink(ev);
    }
    expect(impl.relayAccess.get()[key]).toBe('ok');

    // Now another AUTH challenge: should be a no-op for state. Sticky-
    // OK exists because periodic AUTH refreshes (some relays do this)
    // would otherwise cause the UI to flicker channels off, then on.
    const pool = fake.state.pools.at(-1)!;
    pool.authHandler!(url);
    expect(impl.relayAccess.get()[key]).toBe('ok');
  });

  it('CLOSED auth-required during "authenticating" flips to "auth-required" after the soak elapses', async () => {
    const clientMod = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await clientMod.getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const impl = clientMod.getBridgeImpl()!;
    const url = impl.currentRelayUrl.get();
    const key = normalizeRelayUrl(url);

    const pool = fake.state.pools.at(-1)!;
    // The relay challenges; the installed signer is answering it.
    void pool.authHandler!(url)!(authChallenge(url, 'c1', pkHex));
    expect(impl.relayAccess.get()[key]).toBe('authenticating');

    // Switch to fake timers AFTER login so the connect() handshake
    // (which uses microtasks + a synchronous ensureRelay) isn't held up.
    vi.useFakeTimers();

    // Simulate the relay sending CLOSED with an auth-required reason
    // on a sub. This drives setRelayAccessDeferred: the soak window
    // is the bridge's mechanism for hiding transient AUTH races.
    const sub = fake.state.subscriptions.find((s) =>
      Array.isArray((s.filter as any).kinds) && (s.filter as any).kinds.includes(39000),
    );
    expect(sub).toBeTruthy();
    // nostr-tools' failed-AUTH wrapper: the only form a transient AUTH race
    // reaches an `onauth` sub in (see classifyAccessClose).
    sub!.onclose?.(['auth was required and attempted, but failed with: Error: auth timed out']);

    // During the soak window, state stays 'authenticating': we don't
    // want to flash a "Not authenticated" banner if the very next retry
    // is going to succeed.
    expect(impl.relayAccess.get()[key]).toBe('authenticating');

    // Advance past RELAY_ACCESS_SOAK_MS (4000ms). The deferred timer
    // re-evaluates state and routes through setRelayAccess, which
    // detects the 'authenticating' → 'auth-required' transition and
    // marks the activity-log entry failed in the same step.
    vi.advanceTimersByTime(4500);

    expect(impl.relayAccess.get()[key]).toBe('auth-required');
  });


  it('a later ensureRelay (new REQ) does not overwrite "restricted" with "authenticating"', async () => {
    const clientMod = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await clientMod.getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const impl = clientMod.getBridgeImpl()!;
    const url = impl.currentRelayUrl.get();
    const key = normalizeRelayUrl(url);
    const pool = fake.state.pools.at(-1)!;

    // Post-AUTH refusal on a relay-wide sub: nostr-tools only hands a bare
    // `auth-required:` to an `onauth` sub once AUTH succeeded.
    const sub = fake.state.subscriptions.find((s) =>
      Array.isArray((s.filter as any).kinds) && (s.filter as any).kinds.includes(39000),
    );
    sub!.onclose?.(['auth-required: Authentication required: this relay only accepts whitelisted pubkeys']);
    expect(impl.relayAccess.get()[key]).toBe('restricted');

    // nostr-tools calls automaticallyAuth on every ensureRelay: every
    // retry, REQ and publish. None of them may undo the verdict.
    pool.authHandler!(url);
    pool.authHandler!(url);
    expect(impl.relayAccess.get()[key]).toBe('restricted');

    // A failed-AUTH CLOSED is weaker news than "restricted": ignored too.
    vi.useFakeTimers();
    const other = fake.state.subscriptions.find((s) =>
      Array.isArray((s.filter as any).kinds) && (s.filter as any).kinds.includes(39001),
    );
    other?.onclose?.(['auth was required and attempted, but failed with: Error: auth timed out']);
    vi.advanceTimersByTime(4500);
    expect(impl.relayAccess.get()[key]).toBe('restricted');
  });

  it('"restricted" still clears to "ok" when the relay starts serving us', async () => {
    const clientMod = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await clientMod.getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const impl = clientMod.getBridgeImpl()!;
    const key = normalizeRelayUrl(impl.currentRelayUrl.get());
    // findLast: the previous test's bridge (a stale module instance) can
    // still push retry subs into the shared fake; ours are the newest.
    const metaSub = () => fake.state.subscriptions.findLast((s) =>
      Array.isArray((s.filter as any).kinds) && (s.filter as any).kinds.includes(39000),
    );
    // The retry the CLOSED schedules is `setTimeout(start, 0)`; take the clock
    // before it is armed so we fire it rather than nap 10 real ms and hope.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    metaSub()!.onclose?.(['auth-required: Authentication required: this relay only accepts whitelisted pubkeys']);
    expect(impl.relayAccess.get()[key]).toBe('restricted');

    // e.g. an operator whitelisted the key and the immediate retry got through.
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    const ev: NostrEvent = {
      id: 'meta-1', pubkey: 'relay-pk', created_at: 1, kind: 39000, sig: '', content: '',
      tags: [['d', 'group-x'], ['name', 'X']],
    };
    for (const sub of fake.state.subscriptions) {
      if (fake.matches(sub.filter, ev)) sub.sink(ev);
    }
    expect(impl.relayAccess.get()[key]).toBe('ok');
  });

  it('a publish refused with a whitelist reason flips to "restricted" without the soak', async () => {
    const clientMod = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await clientMod.getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const impl = clientMod.getBridgeImpl()!;
    const url = impl.currentRelayUrl.get();
    const key = normalizeRelayUrl(url);
    const pool = fake.state.pools.at(-1)! as unknown as { publish: (...a: unknown[]) => Promise<string>[] };
    pool.publish = () => [Promise.reject(new Error('restricted: Access denied: your pubkey is not whitelisted on this relay'))];

    const ev = finalizeEvent(
      { kind: 9, content: 'hi', tags: [['h', 'g']], created_at: Math.floor(Date.now() / 1000) },
      Uint8Array.from(skHex.match(/../g)!.map((b) => parseInt(b, 16))),
    );
    await impl.publishSignedEvent(ev, [url], { quiet: true }).catch(() => {});
    expect(impl.relayAccess.get()[key]).toBe('restricted');
  });

  it('a group-level "restricted:" publish refusal keeps the soak', async () => {
    const clientMod = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await clientMod.getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const impl = clientMod.getBridgeImpl()!;
    const url = impl.currentRelayUrl.get();
    const key = normalizeRelayUrl(url);
    const pool = fake.state.pools.at(-1)! as unknown as { publish: (...a: unknown[]) => Promise<string>[] };
    pool.publish = () => [Promise.reject(new Error('restricted: you are not a member of this group'))];

    const ev = finalizeEvent(
      { kind: 9, content: 'hi', tags: [['h', 'g']], created_at: Math.floor(Date.now() / 1000) },
      Uint8Array.from(skHex.match(/../g)!.map((b) => parseInt(b, 16))),
    );
    await impl.publishSignedEvent(ev, [url], { quiet: true }).catch(() => {});
    expect(impl.relayAccess.get()[key]).not.toBe('restricted');
  });

  it('the preflight watchdog waits out a slow NIP-42 approval started by automaticallyAuth', async () => {
    const clientMod = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const sk = Uint8Array.from(skHex.match(/../g)!.map((b) => parseInt(b, 16)));
    let approve!: () => void;
    const approved = new Promise<void>((r) => { approve = r; });
    const signEvent = vi.fn(async (template: any) => {
      if (template.kind === 22242) await approved; // human staring at the popup
      return finalizeEvent({ ...template }, sk);
    });
    Object.defineProperty(window, 'nostr', { configurable: true, value: { signEvent, getPublicKey: async () => pkHex } });
    const bridge = await clientMod.getBridge();
    await bridge.loginWithNip07(pkHex);

    const impl = clientMod.getBridgeImpl()!;
    const url = impl.currentRelayUrl.get();
    const key = normalizeRelayUrl(url);
    const isPreflight = (s: { filter: Record<string, unknown> }) =>
      (s.filter.kinds as number[] | undefined)?.[0] === 0
      && (s.filter.authors as string[] | undefined)?.includes(pkHex)
      && s.filter.limit === 1;
    expect(fake.state.subscriptions.some(isPreflight)).toBe(true);

    vi.useFakeTimers();
    // The pool's automaticallyAuth starts the signature; the preflight's own
    // onauth never runs (nostr-tools dedupes AUTH per socket).
    const signer = fake.state.pools.at(-1)!.authHandler!(url)!;
    const signing = signer(authChallenge(url, 'c1', pkHex));

    vi.advanceTimersByTime(6000); // well past the 1.5s preflight watchdog
    const preflight = fake.state.subscriptions.find(isPreflight);
    expect(preflight).toBeDefined();

    vi.useRealTimers();
    approve();
    await signing;
    preflight!.onclose?.(['auth-required: Authentication required: this relay only accepts whitelisted pubkeys']);
    expect(impl.relayAccess.get()[key]).toBe('restricted');
  });

  // What a whitelist relay actually produces through nostr-tools: for every
  // REQ, the pool fires a synthetic EOSE (handleClose → handleEose) and then
  // onclose, in the same tick. The preflight lands first; the rest of the
  // fan-out follows. The verdict must survive every later EOSE.
  for (const reason of [
    'restricted: Access denied: your pubkey is not whitelisted on this relay',
    'auth-required: Authentication required: this relay only accepts whitelisted pubkeys',
  ]) {
    it(`stays "restricted" through the pool's EOSE-then-CLOSED on every sub (${reason.split(':')[0]})`, async () => {
      const clientMod = await import('@/services/nostr-bridge/client');
      const { skHex, pkHex } = makeKeypair();
      const bridge = await clientMod.getBridge();
      await bridge.loginWithNsec(skHex, pkHex);

      const impl = clientMod.getBridgeImpl()!;
      const key = normalizeRelayUrl(impl.currentRelayUrl.get());
      const ours = fake.state.subscriptions.slice();
      const isPreflight = (s: { filter: Record<string, unknown> }) =>
        (s.filter.kinds as number[] | undefined)?.[0] === 0
        && (s.filter.authors as string[] | undefined)?.includes(pkHex)
        && s.filter.limit === 1;
      const ordered = [...ours.filter(isPreflight), ...ours.filter((s) => !isPreflight(s))];
      expect(ordered.length).toBeGreaterThan(3);

      // The immediate retries are `setTimeout(start, 0)`; own the clock so
      // they fire because we advanced it, not because 10 real ms sufficed.
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      for (const sub of ordered) {
        sub.oneose?.();
        sub.onclose?.(sub.relays.map(() => reason));
      }
      expect(impl.relayAccess.get()[key]).toBe('restricted');

      // Retries re-REQ, get the same EOSE-then-CLOSED, and re-enter
      // automaticallyAuth: still nothing may dislodge the verdict.
      await vi.advanceTimersByTimeAsync(0);
      vi.useRealTimers();
      fake.state.pools.at(-1)!.authHandler!(impl.currentRelayUrl.get());
      for (const sub of fake.state.subscriptions.slice()) {
        sub.oneose?.();
        sub.onclose?.(sub.relays.map(() => reason));
      }
      expect(impl.relayAccess.get()[key]).toBe('restricted');
    });
  }

  it('classifyAccessClose separates post-AUTH refusals from AUTH failures', async () => {
    const { classifyAccessClose } = await import('@/services/nostr-bridge/client');
    const refusal = 'auth-required: Authentication required: this relay only accepts whitelisted pubkeys';
    expect(classifyAccessClose(refusal, true)).toBe('restricted');
    expect(classifyAccessClose(refusal, false)).toBe('auth-required');
    expect(classifyAccessClose('auth was required and attempted, but failed with: Error: auth timed out', true))
      .toBe('auth-required');
    expect(classifyAccessClose('auth was required and attempted, but failed with: restricted: blocked', true))
      .toBe('restricted');
    expect(classifyAccessClose('restricted: Access denied: your pubkey is not whitelisted on this relay', true))
      .toBe('restricted');
    expect(classifyAccessClose('restricted: Subscription quota exceeded: 50/50', true)).toBeNull();
    expect(classifyAccessClose('closed by caller', true)).toBeNull();
  });

  it('does not AUTH an override relay used by a watched subscription', async () => {
    const clientMod = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await clientMod.getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const impl = clientMod.getBridgeImpl()!;
    const pool = fake.state.pools.at(-1)!;
    const auxUrl = 'wss://relay.extra.example';
    const stop = impl.subscribeFilterWatched(
      { kinds: [1] },
      () => {},
      { relays: [auxUrl], relayMode: 'replace' },
    );

    for (let i = 0; i < 4; i++) await Promise.resolve();
    // The registry issues the REQ once the aux relay's socket is up, so it
    // is found by its filter rather than by position, and the hub spells the
    // URL as a real SimplePool sends it (nostr-tools normalizeURL keeps the
    // trailing slash on a bare host).
    const aux = fake.state.subscriptions.find((sub) => (sub.filter as { kinds?: number[] }).kinds?.join() === '1');
    expect(aux?.relays).toEqual([normalizeURL(auxUrl)]);
    expect(pool.authHandler!(auxUrl)).toBeNull();
    expect(impl.relayAccess.get()[normalizeRelayUrl(auxUrl)]).toBeUndefined();
    stop();
  });


  it('does not enter "authenticating" for an auxiliary (non-active) relay', async () => {
    const clientMod = await import('@/services/nostr-bridge/client');
    const { skHex, pkHex } = makeKeypair();
    const bridge = await clientMod.getBridge();
    await bridge.loginWithNsec(skHex, pkHex);

    const impl = clientMod.getBridgeImpl()!;
    const pool = fake.state.pools.at(-1)!;
    const auxUrl = 'wss://relay.damus.io';

    expect(pool.authHandler!(auxUrl)).toBeNull();

    const activeKey = normalizeRelayUrl(impl.currentRelayUrl.get());
    expect(impl.relayAccess.get()[activeKey]).toBeUndefined();
  });
});
