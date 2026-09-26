/**
 * NIP-42 on the relay a mesh call is pinned to.
 *
 * Two failures this guards against, both of which silently lost every
 * beacon and signal on a fresh socket:
 *   1. `automaticallyAuth` only answered for the relay being browsed, so a
 *      call pinned to another relay never authenticated.
 *   2. A whitelist relay refuses an EVENT that beats AUTH with `restricted:`
 *      — not `auth-required:` — and nostr-tools only retries the latter.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSecretKey, getPublicKey, type Event as NostrEvent } from 'nostr-tools';

const fake = vi.hoisted(() => {
  interface FakeRelay {
    url: string;
    connected: boolean;
    onclose?: () => void;
    challenge?: string;
    authed: boolean;
    authCalls: number;
    /** Reason to refuse with before / after AUTH; null accepts. */
    refuseBeforeAuth: string | null;
    refuseAfterAuth: string | null;
    publishes: NostrEvent[];
    auth(signer: (evt: unknown) => Promise<unknown>): Promise<string>;
    publish(ev: NostrEvent): Promise<string>;
  }

  const state = {
    pools: [] as Array<{ authHandler: ((url: string) => unknown) | null }>,
    relays: new Map<string, FakeRelay>(),
  };

  function relay(url: string): FakeRelay {
    let r = state.relays.get(url);
    if (!r) {
      r = {
        url,
        connected: true,
        challenge: 'challenge-1',
        authed: false,
        authCalls: 0,
        refuseBeforeAuth: null,
        refuseAfterAuth: null,
        publishes: [],
        async auth(signer) {
          this.authCalls += 1;
          await signer({ kind: 22242, tags: [], content: '', created_at: 0 });
          this.authed = true;
          return 'ok';
        },
        async publish(ev) {
          this.publishes.push(ev);
          const reason = this.authed ? this.refuseAfterAuth : this.refuseBeforeAuth;
          if (reason) throw new Error(reason);
          return 'ok';
        },
      };
      state.relays.set(url, r);
    }
    return r;
  }

  class FakePool {
    authHandler: ((url: string) => unknown) | null;
    constructor(opts?: { automaticallyAuth?: (url: string) => unknown }) {
      this.authHandler = opts?.automaticallyAuth ?? null;
      state.pools.push(this);
    }
    subscribe() { return { close: () => {} }; }
    publish(relays: string[], ev: NostrEvent): Promise<string>[] {
      return relays.map((u) => relay(u).publish(ev));
    }
    close() {}
    async ensureRelay(url: string) { return relay(url); }
    async querySync() { return []; }
  }

  return { state, FakePool, relay };
});

vi.mock('nostr-tools', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, SimplePool: fake.FakePool };
});

const VOICE_RELAY = 'wss://voice.example';

async function loggedInBridge() {
  const clientMod = await import('./client');
  const sk = generateSecretKey();
  const skHex = Array.from(sk).map((x) => x.toString(16).padStart(2, '0')).join('');
  const bridge = await clientMod.getBridge();
  await bridge.loginWithNsec(skHex, getPublicKey(sk));
  return clientMod.getBridgeImpl()!;
}

const signal = { kind: 25050, content: '{}', tags: [['p', 'x'.repeat(64)]] };
const toVoiceRelay = { extraRelays: [VOICE_RELAY], mode: 'replace' as const };

beforeEach(() => {
  fake.state.pools = [];
  fake.state.relays.clear();
  vi.resetModules();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('voice relay AUTH', () => {
  it('answers AUTH on a pinned voice relay only while a call subscription is open', async () => {
    const impl = await loggedInBridge();
    const chatPool = fake.state.pools.at(-1)!;
    expect(chatPool.authHandler!(VOICE_RELAY)).toBeNull();

    const stop = impl.subscribeVoiceFilterWatched(
      { kinds: [20078], '#e': ['ch'] },
      () => {},
      { relays: [VOICE_RELAY], relayMode: 'replace', answerAuth: true },
    );
    const voicePool = fake.state.pools.at(-1)!;
    expect(voicePool).not.toBe(chatPool);
    // Both pools: subscriptions ride the voice pool, publishes the chat pool.
    expect(voicePool.authHandler!(VOICE_RELAY)).toBeTypeOf('function');
    expect(chatPool.authHandler!(`${VOICE_RELAY}/`)).toBeTypeOf('function');
    // Answering AUTH there must not repaint the browsed relay's indicator.
    expect(impl.relayAccess.get()['wss://voice.example']).toBeUndefined();

    stop();
    expect(chatPool.authHandler!(VOICE_RELAY)).toBeNull();
  });

  it('keeps answering until the last of several voice subscriptions closes', async () => {
    const impl = await loggedInBridge();
    const chatPool = fake.state.pools.at(-1)!;
    const opts = { relays: [VOICE_RELAY], relayMode: 'replace' as const, answerAuth: true };
    const stopRoster = impl.subscribeVoiceFilterWatched({ kinds: [20078] }, () => {}, opts);
    const stopSignals = impl.subscribeVoiceFilterWatched({ kinds: [25050] }, () => {}, opts);
    stopRoster();
    expect(chatPool.authHandler!(VOICE_RELAY)).toBeTypeOf('function');
    stopSignals();
    expect(chatPool.authHandler!(VOICE_RELAY)).toBeNull();
  });
});

describe('authRetryOnRestricted', () => {
  it('AUTHs and republishes once when a pre-AUTH EVENT is refused `restricted:`', async () => {
    const impl = await loggedInBridge();
    const relay = fake.relay(VOICE_RELAY);
    relay.refuseBeforeAuth = 'restricted: Access denied: your pubkey is not whitelisted';

    await expect(
      impl.publishEvent(signal, { ...toVoiceRelay, authRetryOnRestricted: true }),
    ).resolves.toMatchObject({ kind: 25050 });
    expect(relay.authCalls).toBe(1);
    expect(relay.publishes).toHaveLength(2);
  });

  it('does not retry without the option', async () => {
    const impl = await loggedInBridge();
    const relay = fake.relay(VOICE_RELAY);
    relay.refuseBeforeAuth = 'restricted: Access denied: your pubkey is not whitelisted';

    await expect(impl.publishEvent(signal, toVoiceRelay)).rejects.toThrow(/restricted/);
    expect(relay.authCalls).toBe(0);
  });

  it('stops retrying on a socket that still refuses after AUTH', async () => {
    const impl = await loggedInBridge();
    const relay = fake.relay(VOICE_RELAY);
    relay.refuseBeforeAuth = 'restricted: not whitelisted';
    relay.refuseAfterAuth = 'restricted: not whitelisted';
    const opts = { ...toVoiceRelay, authRetryOnRestricted: true };

    await expect(impl.publishEvent(signal, opts)).rejects.toThrow(/restricted/);
    expect(relay.publishes).toHaveLength(2);

    // Same socket, same challenge: the key just isn't whitelisted. One
    // attempt per publish, not two.
    await expect(impl.publishEvent(signal, opts)).rejects.toThrow(/restricted/);
    expect(relay.publishes).toHaveLength(3);

    // A reconnect brings a fresh challenge — the pre-AUTH race is back.
    relay.challenge = 'challenge-2';
    await expect(impl.publishEvent(signal, opts)).rejects.toThrow(/restricted/);
    expect(relay.publishes).toHaveLength(5);
  });

  it('does not AUTH a relay that never sent a challenge', async () => {
    const impl = await loggedInBridge();
    const relay = fake.relay(VOICE_RELAY);
    relay.challenge = undefined;
    relay.refuseBeforeAuth = 'restricted: not whitelisted';

    await expect(
      impl.publishEvent(signal, { ...toVoiceRelay, authRetryOnRestricted: true }),
    ).rejects.toThrow(/restricted/);
    expect(relay.authCalls).toBe(0);
  });

  it('ignores refusals that AUTH cannot fix', async () => {
    const impl = await loggedInBridge();
    const relay = fake.relay(VOICE_RELAY);
    relay.refuseBeforeAuth = 'invalid: bad signature';

    await expect(
      impl.publishEvent(signal, { ...toVoiceRelay, authRetryOnRestricted: true }),
    ).rejects.toThrow(/invalid/);
    expect(relay.authCalls).toBe(0);
  });
});
